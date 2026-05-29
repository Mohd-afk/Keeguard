package com.mohdj.securevault.autofill.handler

import android.content.Context
import com.mohdj.securevault.autofill.AutofillEvent
import com.mohdj.securevault.autofill.AutofillEventBus
import com.mohdj.securevault.autofill.SecureLogger
import com.mohdj.securevault.autofill.matcher.CredentialMatcher
import com.mohdj.securevault.autofill.matcher.VaultCredential
import com.mohdj.securevault.autofill.matcher.VaultRepository
import com.mohdj.securevault.autofill.parser.ParsedForm
import com.mohdj.securevault.autofill.suggestion.SmartCategorySuggester

class SaveRequestHandler(
    private val context: Context,
    private val credentialMatcher: CredentialMatcher,
    private val vaultRepository: VaultRepository,
    private val categorySuggester: SmartCategorySuggester
) {
    sealed class SaveResult {
        object NoChange : SaveResult()
        object IncompleteData : SaveResult()
        data class NeedsNewSave(val username: String, val password: String, val suggestedCategoryId: String?) : SaveResult()
        data class NeedsUpdate(val existingId: String, val username: String, val newPassword: String) : SaveResult()
    }

    suspend fun evaluate(
        parsedForm: ParsedForm,
        extractedUsername: String?,
        extractedPassword: String?
    ): SaveResult {
        val username = extractedUsername ?: ""
        val password = extractedPassword ?: ""

        // 1. Verify via FormSubmissionHeuristics
        if (!FormSubmissionHeuristics.shouldPromptSave(parsedForm, username, password)) {
            SecureLogger.i("SaveRequestHandler: FormSubmissionHeuristics rejected save trigger.")
            return SaveResult.IncompleteData
        }

        // 2. Find if this credential already exists in database
        val existing = if (username.isNotEmpty()) {
            credentialMatcher.findByUsernameAndDomain(username, parsedForm.canonicalIdentifier)
        } else null

        return when {
            existing == null -> {
                val suggestedCat = categorySuggester.suggest(parsedForm)
                SaveResult.NeedsNewSave(username, password, suggestedCat)
            }
            existing.password != password -> {
                SaveResult.NeedsUpdate(existing.id, existing.username, password)
            }
            else -> SaveResult.NoChange
        }
    }

    /**
     * Launches the in-app save bottom sheet by emitting an event to the AutofillEventBus.
     */
    fun launchSaveUI(result: SaveResult, parsedForm: ParsedForm) {
        when (result) {
            is SaveResult.NeedsNewSave -> {
                val event = AutofillEvent.SaveRequestEvent(
                    action = "new",
                    domain = parsedForm.canonicalIdentifier,
                    username = result.username,
                    password = result.password,
                    credentialId = "",
                    suggestedCategoryId = result.suggestedCategoryId
                )
                val success = AutofillEventBus.trySend(event)
                SecureLogger.i("SaveRequestHandler: Dispatched new save event via EventBus (success=$success)")
            }
            is SaveResult.NeedsUpdate -> {
                val event = AutofillEvent.SaveRequestEvent(
                    action = "update",
                    domain = parsedForm.canonicalIdentifier,
                    username = result.username,
                    password = result.newPassword,
                    credentialId = result.existingId,
                    suggestedCategoryId = null
                )
                val success = AutofillEventBus.trySend(event)
                SecureLogger.i("SaveRequestHandler: Dispatched update save event via EventBus (success=$success)")
            }
            else -> {
                SecureLogger.d("SaveRequestHandler: No change detected or incomplete data. Skipping Save UI.")
            }
        }
    }
}
