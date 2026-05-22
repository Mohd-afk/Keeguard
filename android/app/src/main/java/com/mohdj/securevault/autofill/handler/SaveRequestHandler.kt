package com.mohdj.securevault.autofill.handler

import android.content.Context
import android.content.Intent
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
        if (extractedUsername.isNullOrBlank() && extractedPassword.isNullOrBlank()) {
            return SaveResult.IncompleteData
        }
        val password = extractedPassword ?: return SaveResult.IncompleteData

        val existing = extractedUsername?.let {
            credentialMatcher.findByUsernameAndDomain(it, parsedForm.canonicalIdentifier)
        }

        return when {
            existing == null -> {
                val suggestedCat = categorySuggester.suggest(parsedForm)
                SaveResult.NeedsNewSave(extractedUsername ?: "", password, suggestedCat)
            }
            existing.password != password -> {
                SaveResult.NeedsUpdate(existing.id, existing.username, password)
            }
            else -> SaveResult.NoChange
        }
    }

    // Launches the in-app save bottom sheet via a broadcast to the Capacitor layer
    fun launchSaveUI(result: SaveResult, parsedForm: ParsedForm) {
        when (result) {
            is SaveResult.NeedsNewSave -> {
                val intent = Intent("com.mohdj.securevault.AUTOFILL_SAVE").apply {
                    putExtra("action", "new")
                    putExtra("domain", parsedForm.canonicalIdentifier)
                    putExtra("username", result.username)
                    putExtra("password", result.password)
                    putExtra("suggested_category_id", result.suggestedCategoryId)
                }
                context.sendBroadcast(intent)
            }
            is SaveResult.NeedsUpdate -> {
                val intent = Intent("com.mohdj.securevault.AUTOFILL_SAVE").apply {
                    putExtra("action", "update")
                    putExtra("domain", parsedForm.canonicalIdentifier)
                    putExtra("credential_id", result.existingId)
                    putExtra("username", result.username)
                    putExtra("new_password", result.newPassword)
                }
                context.sendBroadcast(intent)
            }
            else -> { /* No-op */ }
        }
    }
}
