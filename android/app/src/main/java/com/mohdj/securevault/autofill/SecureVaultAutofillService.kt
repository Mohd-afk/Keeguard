package com.mohdj.securevault.autofill

import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillContext
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.widget.inline.InlinePresentationSpec
import com.mohdj.securevault.autofill.builder.FillResponseBuilder
import com.mohdj.securevault.autofill.builder.SaveInfoBuilder
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm
import com.mohdj.securevault.autofill.suggestion.InlineSuggestionHealthTracker
import com.mohdj.securevault.security.BiometricVaultUnlocker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SecureVaultAutofillService : AutofillService() {

    private lateinit var domainMatcher: DomainMatcher
    private lateinit var inlineHealthTracker: InlineSuggestionHealthTracker
    private lateinit var responseBuilder: FillResponseBuilder

    override fun onCreate() {
        super.onCreate()
        SecureLogger.init(applicationContext)
        domainMatcher = DomainMatcher(applicationContext)
        inlineHealthTracker = InlineSuggestionHealthTracker(applicationContext)
        responseBuilder = FillResponseBuilder(applicationContext)
        AutofillServiceLocator.initializeIfNeeded(applicationContext)
        SecureLogger.i("Service created")
    }

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val fillContext: FillContext = request.fillContexts.lastOrNull() ?: run {
            SecureLogger.e("AUTOFILL_SUPPRESSED_REASON=no_fill_context")
            callback.onSuccess(null)
            return
        }

        val structure: AssistStructure = fillContext.structure
        val rawPackageName = structure.activityComponent?.packageName ?: ""
        SecureLogger.i("AUTOFILL_REQUEST_RECEIVED package=$rawPackageName")

        val locator = AutofillServiceLocator.getInstance(applicationContext)

        // ── 1. Check Package Blocklist ───────────────────────────────────────
        if (locator.exclusionGuard.shouldSkip(structure)) {
            SecureLogger.i("AUTOFILL_SUPPRESSED_REASON=package_excluded package=$rawPackageName")
            callback.onSuccess(null)
            return
        }

        // ── 2. Parse the view hierarchy ──────────────────────────────────────
        val parsedForm = locator.structureParser.parse(structure)
        val hasUsername = parsedForm.usernameField != null
        val hasEmail = parsedForm.emailField != null
        val hasPassword = parsedForm.passwordField != null
        val hasNewPassword = parsedForm.newPasswordField != null

        SecureLogger.i("AUTOFILL_PARSED_FORM formType=${parsedForm.formType} hasUser=$hasUsername hasEmail=$hasEmail hasPass=$hasPassword hasNewPass=$hasNewPassword webDomain=${parsedForm.webDomain}")

        if (!hasUsername && !hasEmail && !hasPassword && !hasNewPassword) {
            SecureLogger.d("AUTOFILL_SUPPRESSED_REASON=no_relevant_fields package=$rawPackageName")
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
            SecureLogger.e("AUTOFILL_SUPPRESSED_REASON=no_identity")
            callback.onSuccess(null)
            return
        }

        val normalizedIdentity: String = when (identityType) {
            "web" -> domainMatcher.normalize(rawIdentity) ?: rawIdentity
            else  -> domainMatcher.getAppMapping(rawPackageName) ?: rawPackageName
        }

        SecureLogger.i("AUTOFILL_IDENTITY_RESOLVED type=$identityType raw=$rawIdentity normalized=$normalizedIdentity")

        // ── 4. Multi-step login guard (Web only) ─────────────────────────────
        val isWebContext = (identityType == "web")
        var cachedUsername: String? = null

        val currentUsernameField = parsedForm.usernameField ?: parsedForm.emailField
        if (currentUsernameField != null && !hasPassword && !hasNewPassword) {
            if (isWebContext) {
                val usernameText = currentUsernameField.currentValue?.textValue?.toString() ?: ""
                if (usernameText.isNotEmpty()) {
                    LoginSessionCache.put(normalizedIdentity, rawPackageName, usernameText)
                    SecureLogger.d("LoginSessionCache: stored username context")
                }
            }
        } else if ((hasPassword || hasNewPassword) && currentUsernameField == null) {
            if (isWebContext) {
                cachedUsername = LoginSessionCache.get(normalizedIdentity, rawPackageName)
                if (cachedUsername == null) {
                    SecureLogger.w("AUTOFILL_SUPPRESSED_REASON=naked_password_web_no_cache identity=$normalizedIdentity")
                    callback.onSuccess(null)
                    return
                }
                SecureLogger.i("LoginSessionCache: restored username context")
            }
        }

        // ── 5. Check user-defined blocklist ──────────────────────────────────
        val prefs = applicationContext.getSharedPreferences("SecureVaultSettings", Context.MODE_PRIVATE)
        val blocklist = prefs.getStringSet("autofillBlocklist", emptySet()) ?: emptySet()
        if (blocklist.contains(normalizedIdentity)) {
            SecureLogger.i("AUTOFILL_SUPPRESSED_REASON=blocked_domain identity=$normalizedIdentity")
            callback.onSuccess(null)
            return
        }

        // ── 6. Vault lock / unlock dispatch ──────────────────────────────────
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!locator.credentialMatcher.vaultRepository.isVaultUnlocked()) {
                    SecureLogger.i("AUTOFILL_VAULT_LOCKED: returning authentication intent identity=$normalizedIdentity")

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

                        val uIds = listOfNotNull(parsedForm.usernameField?.autofillId, parsedForm.emailField?.autofillId)
                        val pIds = listOfNotNull(parsedForm.passwordField?.autofillId, parsedForm.newPasswordField?.autofillId)
                        putParcelableArrayListExtra("USERNAME_IDS", ArrayList(uIds))
                        putParcelableArrayListExtra("PASSWORD_IDS", ArrayList(pIds))
                    }

                    val code = PendingIntentRequestCodeGenerator.getNext()
                    val response = responseBuilder.buildLockedResponse(parsedForm, unlockIntent, code)
                    callback.onSuccess(response)
                    return@launch
                }

                // ── 7. Vault unlocked: find matching credentials ─────────────
                val matchingCreds = locator.credentialMatcher.findMatches(parsedForm)
                SecureLogger.i("AUTOFILL_MATCH_COUNT identity=$normalizedIdentity count=${matchingCreds.size}")

                val saveInfo = SaveInfoBuilder().build(parsedForm)

                if (matchingCreds.isEmpty()) {
                    SecureLogger.i("AUTOFILL_SUPPRESSED_REASON=no_matching_credentials identity=$normalizedIdentity")
                    val response = responseBuilder.buildSaveOnlyResponse(saveInfo)
                    callback.onSuccess(response)
                    return@launch
                }

                // Filter by cached username in multi-step flow if needed
                val filteredCreds = if (!cachedUsername.isNullOrBlank()) {
                    matchingCreds.filter { it.username.equals(cachedUsername, ignoreCase = true) }
                        .ifEmpty { matchingCreds }
                } else {
                    matchingCreds
                }

                // Inline suggestions detection
                var inlineSpecs: List<InlinePresentationSpec>? = null
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    inlineSpecs = request.inlineSuggestionsRequest?.inlinePresentationSpecs
                }

                val activeIme = inlineHealthTracker.getActiveImePackage()
                val isInlineAllowed = !AutofillCapabilityMatrix.isSamsungQuirkDevice() && 
                                     inlineHealthTracker.isInlineSupported(activeIme)

                val fillResponse = responseBuilder.buildFilledResponse(
                    parsedForm = parsedForm,
                    credentials = filteredCreds,
                    saveInfo = saveInfo,
                    inlineSpecs = inlineSpecs,
                    isInlineAllowed = isInlineAllowed
                )

                SecureLogger.i("AUTOFILL_FILL_RESPONSE_SENT identity=$normalizedIdentity")
                callback.onSuccess(fillResponse)

            } catch (e: Exception) {
                SecureLogger.e("AUTOFILL_EXCEPTION message=${e.message}", e)
                callback.onFailure("autofill_exception")
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        SecureLogger.i("AUTOFILL_SAVE_REQUEST_RECEIVED")

        val fillContext = request.fillContexts.lastOrNull() ?: run {
            SecureLogger.e("AUTOFILL_SAVE: context is null")
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
                SecureLogger.d("AUTOFILL_SAVE: restored username from session cache")
            }
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = locator.saveRequestHandler.evaluate(parsedForm, finalUsername, extractedPassword)
                locator.saveRequestHandler.launchSaveUI(result, parsedForm)
                SecureLogger.i("AUTOFILL_SAVE_EVALUATED: result=$result")
                callback.onSuccess()
            } catch (e: Exception) {
                SecureLogger.e("AUTOFILL_SAVE: exception message=${e.message}", e)
                callback.onFailure("save_exception")
            }
        }
    }
}
