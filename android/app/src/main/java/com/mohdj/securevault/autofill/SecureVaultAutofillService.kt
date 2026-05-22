package com.mohdj.securevault.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillContext
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.util.Log
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import com.mohdj.securevault.autofill.builder.SaveInfoBuilder
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm
import com.mohdj.securevault.security.BiometricVaultUnlocker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

private const val TAG = "KeeguardAutofill"

class SecureVaultAutofillService : AutofillService() {

    private lateinit var domainMatcher: DomainMatcher

    override fun onCreate() {
        super.onCreate()
        domainMatcher = DomainMatcher(applicationContext)
        AutofillServiceLocator.initializeIfNeeded(applicationContext)
        Log.i(TAG, "Service created")
    }

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val fillContext: FillContext = request.fillContexts.lastOrNull() ?: run {
            Log.e(TAG, "AUTOFILL_SUPPRESSED_REASON=no_fill_context")
            callback.onSuccess(null)
            return
        }

        val structure: AssistStructure = fillContext.structure
        val rawPackageName = structure.activityComponent?.packageName ?: ""
        Log.i(TAG, "AUTOFILL_REQUEST_RECEIVED package=$rawPackageName")

        val locator = AutofillServiceLocator.getInstance(applicationContext)

        // ── 1. Check Package Blocklist ───────────────────────────────────────
        if (locator.exclusionGuard.shouldSkip(structure)) {
            Log.i(TAG, "AUTOFILL_SUPPRESSED_REASON=package_excluded package=$rawPackageName")
            callback.onSuccess(null)
            return
        }

        // ── 2. Parse the view hierarchy ──────────────────────────────────────
        val parsedForm = locator.structureParser.parse(structure)
        val hasUsername = parsedForm.usernameField != null
        val hasPassword = parsedForm.passwordField != null
        val hasNewPassword = parsedForm.newPasswordField != null

        Log.i(TAG, "AUTOFILL_PARSED_FORM formType=${parsedForm.formType} hasUser=$hasUsername hasPass=$hasPassword hasNewPass=$hasNewPassword webDomain=${parsedForm.webDomain}")

        if (!hasUsername && !hasPassword && !hasNewPassword) {
            Log.d(TAG, "AUTOFILL_SUPPRESSED_REASON=no_relevant_fields package=$rawPackageName")
            callback.onSuccess(null)
            return
        }

        // ── 3. Resolve identity ──────────────────────────────────────────────
        val webDomain = parsedForm.webDomain
        val identityType: String
        val rawIdentity: String

        if (!webDomain.isNullOrBlank()) {
            rawIdentity = webDomain
            identityType = "web"
        } else if (rawPackageName.isNotEmpty()) {
            rawIdentity = rawPackageName
            identityType = "package"
        } else {
            Log.e(TAG, "AUTOFILL_SUPPRESSED_REASON=no_identity")
            callback.onSuccess(null)
            return
        }

        val normalizedIdentity: String = when (identityType) {
            "web" -> domainMatcher.normalize(rawIdentity) ?: rawIdentity
            else  -> domainMatcher.getAppMapping(rawPackageName) ?: rawPackageName
        }

        Log.i(TAG, "AUTOFILL_IDENTITY_RESOLVED type=$identityType raw=$rawIdentity normalized=$normalizedIdentity")

        // ── 4. Multi-step login guard (Web only) ─────────────────────────────
        val isWebContext = (identityType == "web")
        var cachedUsername: String? = null

        if (hasUsername && !hasPassword) {
            if (isWebContext) {
                val usernameText = parsedForm.usernameField?.currentValue?.textValue?.toString() ?: ""
                if (usernameText.isNotEmpty()) {
                    LoginSessionCache.put(normalizedIdentity, rawPackageName, usernameText)
                    Log.d(TAG, "LoginSessionCache: stored username context for $normalizedIdentity")
                }
            }
        } else if (hasPassword && !hasUsername) {
            if (isWebContext) {
                cachedUsername = LoginSessionCache.get(normalizedIdentity, rawPackageName)
                if (cachedUsername == null) {
                    Log.w(TAG, "AUTOFILL_SUPPRESSED_REASON=naked_password_web_no_cache identity=$normalizedIdentity")
                    callback.onSuccess(null)
                    return
                }
                Log.i(TAG, "LoginSessionCache: restored username context for $normalizedIdentity")
            }
        }

        // ── 5. Check user-defined blocklist ──────────────────────────────────
        val prefs = applicationContext.getSharedPreferences("SecureVaultSettings", Context.MODE_PRIVATE)
        val blocklist = prefs.getStringSet("autofillBlocklist", emptySet()) ?: emptySet()
        if (blocklist.contains(normalizedIdentity)) {
            Log.i(TAG, "AUTOFILL_SUPPRESSED_REASON=blocked_domain identity=$normalizedIdentity")
            callback.onSuccess(null)
            return
        }

        // ── 6. Vault lock / unlock dispatch ──────────────────────────────────
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!locator.credentialMatcher.vaultRepository.isVaultUnlocked()) {
                    Log.i(TAG, "AUTOFILL_VAULT_LOCKED: returning authentication intent identity=$normalizedIdentity")

                    val unlockIntent = Intent(
                        this@SecureVaultAutofillService,
                        UnlockVaultActivity::class.java
                    ).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                                Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or
                                Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT
                        putExtra("DOMAIN", normalizedIdentity)
                        putExtra("RAW_IDENTITY", rawIdentity)
                        putExtra("IDENTITY_TYPE", identityType)

                        val uIds = listOfNotNull(parsedForm.usernameField?.autofillId)
                        val pIds = listOfNotNull(parsedForm.passwordField?.autofillId, parsedForm.newPasswordField?.autofillId)
                        putParcelableArrayListExtra("USERNAME_IDS", ArrayList(uIds))
                        putParcelableArrayListExtra("PASSWORD_IDS", ArrayList(pIds))
                    }

                    val pendingIntent = PendingIntent.getActivity(
                        this@SecureVaultAutofillService,
                        normalizedIdentity.hashCode(),
                        unlockIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )

                    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1)
                    presentation.setTextViewText(android.R.id.text1, "\uD83D\uDD10 Unlock SecureVault")

                    val lockedDatasetBuilder = Dataset.Builder()
                    lockedDatasetBuilder.setAuthentication(pendingIntent.intentSender)

                    parsedForm.usernameField?.autofillId?.let { lockedDatasetBuilder.setValue(it, null, presentation) }
                    parsedForm.passwordField?.autofillId?.let { lockedDatasetBuilder.setValue(it, null, presentation) }
                    parsedForm.newPasswordField?.autofillId?.let { lockedDatasetBuilder.setValue(it, null, presentation) }

                    val response = FillResponse.Builder()
                        .addDataset(lockedDatasetBuilder.build())
                        .build()

                    callback.onSuccess(response)
                    return@launch
                }

                // ── 7. Vault unlocked: find matching credentials ─────────────
                val matchingCreds = locator.credentialMatcher.findMatches(parsedForm)
                Log.i(TAG, "AUTOFILL_MATCH_COUNT identity=$normalizedIdentity count=${matchingCreds.size}")

                if (matchingCreds.isEmpty()) {
                    Log.i(TAG, "AUTOFILL_SUPPRESSED_REASON=no_matching_credentials identity=$normalizedIdentity")
                    val saveInfo = SaveInfoBuilder().build(parsedForm)
                    val responseBuilder = FillResponse.Builder()
                    if (saveInfo != null) responseBuilder.setSaveInfo(saveInfo)
                    callback.onSuccess(responseBuilder.build())
                    return@launch
                }

                // Filter by cached username in multi-step flow if needed
                val filteredCreds = if (!cachedUsername.isNullOrBlank()) {
                    matchingCreds.filter { it.username.equals(cachedUsername, ignoreCase = true) }
                        .ifEmpty { matchingCreds }
                } else {
                    matchingCreds
                }

                val responseBuilder = FillResponse.Builder()
                var datasetCount = 0

                for (cred in filteredCreds) {
                    val datasetBuilder = Dataset.Builder()
                    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1)
                    presentation.setTextViewText(
                        android.R.id.text1,
                        cred.username.ifEmpty { cred.title }.ifEmpty { "SecureVault" }
                    )

                    var datasetUsable = false

                    parsedForm.usernameField?.autofillId?.let { id ->
                        datasetBuilder.setValue(id, AutofillValue.forText(cred.username), presentation)
                        datasetUsable = true
                    }

                    parsedForm.passwordField?.autofillId?.let { id ->
                        datasetBuilder.setValue(id, AutofillValue.forText(cred.password), presentation)
                        datasetUsable = true
                    }

                    parsedForm.newPasswordField?.autofillId?.let { id ->
                        datasetBuilder.setValue(id, AutofillValue.forText(cred.password), presentation)
                        datasetUsable = true
                    }

                    if (datasetUsable) {
                        responseBuilder.addDataset(datasetBuilder.build())
                        datasetCount++
                    }
                }

                // Add SaveInfo for capturing new / updated logins
                val saveInfo = SaveInfoBuilder().build(parsedForm)
                if (saveInfo != null) responseBuilder.setSaveInfo(saveInfo)

                Log.i(TAG, "AUTOFILL_FILL_RESPONSE_SENT identity=$normalizedIdentity datasetCount=$datasetCount")
                callback.onSuccess(responseBuilder.build())

            } catch (e: Exception) {
                Log.e(TAG, "AUTOFILL_EXCEPTION message=${e.message}", e)
                callback.onFailure("autofill_exception")
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        Log.i(TAG, "AUTOFILL_SAVE_REQUEST_RECEIVED")

        val fillContext = request.fillContexts.lastOrNull() ?: run {
            Log.e(TAG, "AUTOFILL_SAVE: context is null")
            callback.onFailure("save_no_context")
            return
        }

        val structure = fillContext.structure
        val rawPackageName = structure.activityComponent?.packageName ?: ""
        val locator = AutofillServiceLocator.getInstance(applicationContext)

        val parsedForm = locator.structureParser.parse(structure)
        val (extractedUsername, extractedPassword) = locator.structureParser.extractSavedValues(structure, parsedForm)

        var finalUsername = extractedUsername ?: ""
        if (finalUsername.isEmpty()) {
            val cached = LoginSessionCache.get(parsedForm.canonicalIdentifier, rawPackageName)
            if (!cached.isNullOrBlank()) {
                finalUsername = cached
                LoginSessionCache.clear(parsedForm.canonicalIdentifier, rawPackageName)
                Log.d(TAG, "AUTOFILL_SAVE: restored username from session cache")
            }
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = locator.saveRequestHandler.evaluate(parsedForm, finalUsername, extractedPassword)
                locator.saveRequestHandler.launchSaveUI(result, parsedForm)
                Log.i(TAG, "AUTOFILL_SAVE_EVALUATED: result=$result")
                callback.onSuccess()
            } catch (e: Exception) {
                Log.e(TAG, "AUTOFILL_SAVE: exception message=${e.message}", e)
                callback.onFailure("save_exception")
            }
        }
    }
}
