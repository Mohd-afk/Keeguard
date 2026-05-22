package com.mohdj.securevault.autofill

import android.os.OutcomeReceiver
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPasswordOption
import androidx.credentials.provider.CredentialEntry
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.PasswordCredentialEntry
import androidx.credentials.provider.ProviderClearCredentialStateRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * SecureVaultCredentialProviderService
 *
 * Android 14+ Credential Manager integration.
 * Works alongside (not replacing) the classic AutofillService.
 * Shares the same vault data layer via AutofillServiceLocator.
 */
class SecureVaultCredentialProviderService : CredentialProviderService() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: android.os.CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
    ) {
        val locator = AutofillServiceLocator.getInstance(applicationContext)

        scope.launch {
            try {
                val entries = mutableListOf<CredentialEntry>()

                for (option in request.beginGetCredentialOptions) {
                    if (option is BeginGetPasswordOption) {
                        val allCreds = locator.credentialMatcher.vaultRepository.getAllDecryptedCredentials()
                        for (cred in allCreds.take(5)) {
                            val entry = PasswordCredentialEntry.Builder(
                                applicationContext,
                                cred.username,
                                createFillIntent(cred.id),
                                option
                            ).setDisplayName(cred.title).build()
                            entries.add(entry)
                        }
                    }
                }

                callback.onResult(BeginGetCredentialResponse(entries))
            } catch (e: Exception) {
                callback.onError(androidx.credentials.exceptions.GetCredentialUnknownException(e.message))
            }
        }
    }

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: android.os.CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>
    ) {
        callback.onResult(BeginCreateCredentialResponse(emptyList()))
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: android.os.CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>
    ) {
        callback.onResult(null)
    }

    private fun createFillIntent(credentialId: String): android.app.PendingIntent {
        val intent = applicationContext.packageManager
            .getLaunchIntentForPackage(applicationContext.packageName)!!
            .apply { putExtra("credential_fill_id", credentialId) }
        return android.app.PendingIntent.getActivity(
            applicationContext, credentialId.hashCode(), intent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
    }

    override fun onDestroy() { super.onDestroy(); scope.cancel() }
}
