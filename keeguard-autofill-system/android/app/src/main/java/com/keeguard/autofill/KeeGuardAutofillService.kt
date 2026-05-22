package com.keeguard.autofill

import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillContext
import android.service.autofill.FillRequest
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import com.keeguard.autofill.builder.FillResponseBuilder
import com.keeguard.autofill.builder.SaveInfoBuilder
import com.keeguard.autofill.classifier.PackageExclusionGuard
import com.keeguard.autofill.handler.SaveRequestHandler
import com.keeguard.autofill.matcher.CredentialMatcher
import com.keeguard.autofill.parser.AssistStructureParser
import com.keeguard.autofill.parser.FormType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * KeeGuardAutofillService
 *
 * Main Android AutofillService entry point. This class is intentionally thin —
 * it orchestrates calls to the discrete modules and contains zero business logic.
 *
 * Registered in AndroidManifest.xml with BIND_AUTOFILL_SERVICE permission.
 */
class KeeGuardAutofillService : AutofillService() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // These are injected via the AutofillServiceLocator (set up in Application.onCreate)
    private lateinit var exclusionGuard: PackageExclusionGuard
    private lateinit var structureParser: AssistStructureParser
    private lateinit var credentialMatcher: CredentialMatcher
    private lateinit var fillResponseBuilder: FillResponseBuilder
    private lateinit var saveInfoBuilder: SaveInfoBuilder
    private lateinit var saveRequestHandler: SaveRequestHandler

    override fun onCreate() {
        super.onCreate()
        // Resolve dependencies from the service locator
        val locator = AutofillServiceLocator.getInstance(applicationContext)
        exclusionGuard = locator.exclusionGuard
        structureParser = locator.structureParser
        credentialMatcher = locator.credentialMatcher
        fillResponseBuilder = FillResponseBuilder(applicationContext)
        saveInfoBuilder = SaveInfoBuilder()
        saveRequestHandler = locator.saveRequestHandler
        BuildConfigProvider.applicationId = applicationContext.packageName
    }

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val structure = request.fillContexts.lastOrNull()?.structure
            ?: run { callback.onSuccess(null); return }

        // Gate 1: Own app or blocked package — return nothing immediately
        if (exclusionGuard.shouldSkip(structure)) {
            callback.onSuccess(null)
            return
        }

        val parsedForm = structureParser.parse(structure)

        // Gate 2: No meaningful form detected
        if (parsedForm.formType == FormType.UNKNOWN ||
            parsedForm.formType == FormType.SEARCH ||
            !parsedForm.hasPasswordField) {
            callback.onSuccess(null)
            return
        }

        scope.launch {
            try {
                // Gate 3: Vault locked — show single auth challenge, NOT per-field unlock
                if (!credentialMatcher.vaultRepository.isVaultUnlocked()) {
                    val authResponse = fillResponseBuilder.buildAuthChallenge(parsedForm)
                    callback.onSuccess(authResponse)
                    return@launch
                }

                // Gate 4: Vault unlocked — find matches and build response
                val matches = credentialMatcher.findMatches(parsedForm)
                val saveInfo = saveInfoBuilder.build(parsedForm)
                val fillResponse = fillResponseBuilder.buildFillResponse(parsedForm, matches, saveInfo)
                callback.onSuccess(fillResponse)

            } catch (e: Exception) {
                callback.onFailure("KeeGuard autofill error: \${e.message}")
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        val structure = request.fillContexts.lastOrNull()?.structure
            ?: run { callback.onSuccess(); return }

        scope.launch {
            try {
                // Use the stored ParsedForm from the original fill request
                val parsedForm = structureParser.parse(structure)
                val (username, password) = structureParser.extractSavedValues(structure, parsedForm)

                val result = saveRequestHandler.evaluate(parsedForm, username, password)
                saveRequestHandler.launchSaveUI(result, parsedForm)
                callback.onSuccess()
            } catch (e: Exception) {
                callback.onSuccess() // Always succeed — never block the user's form submit
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
