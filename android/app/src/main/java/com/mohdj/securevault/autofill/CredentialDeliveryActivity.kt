package com.mohdj.securevault.autofill

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.credentials.GetCredentialResponse
import androidx.credentials.PasswordCredential
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.PendingIntentHandler
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class CredentialDeliveryActivity : FragmentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Hardened anti-overlay and screen secure configurations
        if (AutofillCapabilityMatrix.supportsHideOverlayWindows()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                window.setHideOverlayWindows(true)
            }
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        val credId = intent.getStringExtra("credential_id") ?: run {
            SecureLogger.w("CredentialDeliveryActivity: Missing credential_id inside intent.")
            setResult(RESULT_CANCELED)
            finish()
            return
        }

        // Bind coroutine lifecycle cleanly to the lifecycleScope to prevent crashes
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val locator = AutofillServiceLocator.getInstance(applicationContext)
                
                // Perform targeted database retrieval by ID
                val allCreds = locator.credentialMatcher.vaultRepository.findMatchingCredentials("")
                val cred = allCreds.firstOrNull { it.id == credId }

                withContext(Dispatchers.Main) {
                    if (cred == null) {
                        SecureLogger.w("CredentialDeliveryActivity: Requested credential not found or vault locked.")
                        setResult(RESULT_CANCELED)
                    } else {
                        val result = PasswordCredential(cred.username, cred.password)
                        val response = GetCredentialResponse(result)
                        val resultIntent = Intent()

                        // Automatically formats and populates resultIntent with GetCredentialResponse
                        PendingIntentHandler.setGetCredentialResponse(
                            resultIntent,
                            response
                        )
                        
                        SecureLogger.i("CredentialDeliveryActivity: Successfully delivered credential password to target app")
                        setResult(RESULT_OK, resultIntent)
                    }
                    finish()
                }
            } catch (e: Exception) {
                SecureLogger.e("CredentialDeliveryActivity: Unexpected error during delivery", e)
                withContext(Dispatchers.Main) {
                    setResult(RESULT_CANCELED)
                    finish()
                }
            }
        }
    }
}
