// PURPOSE: Native Android Autofill service component for UnlockVaultActivity.
package com.mohdj.securevault.autofill

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.fragment.app.FragmentActivity
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.mohdj.securevault.R
import com.mohdj.securevault.security.BiometricKeyManager
import com.mohdj.securevault.security.BiometricVaultUnlocker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class UnlockVaultActivity : FragmentActivity() {

    private var domain: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Anti-overlay and screen secure hardening
        if (AutofillCapabilityMatrix.supportsHideOverlayWindows()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                window.setHideOverlayWindows(true)
            }
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        domain = intent.getStringExtra("DOMAIN") ?: ""
        SecureLogger.i("UnlockVaultActivity: Created for domain=$domain")

        // Immediately show the biometric prompt
        showBiometricPrompt()
    }

    private fun showBiometricPrompt() {
        if (!BiometricKeyManager.isBiometricEnabled(this)) {
            Toast.makeText(
                this,
                "Biometric unlock is not enabled. Open Keeguard to set it up.",
                Toast.LENGTH_LONG
            ).show()
            finishWithCancel()
            return
        }

        val executor = ContextCompat.getMainExecutor(this)
        val biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {

                @RequiresApi(Build.VERSION_CODES.N)
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)

                    val cryptoObject = result.cryptoObject
                    if (cryptoObject?.cipher == null) {
                        SecureLogger.e("UnlockVaultActivity: CryptoObject is null on biometric success — cannot unwrap DEK")
                        TelemetryLogger.logEvent(
                            applicationContext,
                            TelemetryLogger.EventType.BIOMETRIC_FAILURE,
                            domain,
                            mapOf("reason" to "crypto_object_null")
                        )
                        finishAndRemoveTask()
                        return
                    }

                    try {
                        val unwrappedDEK = BiometricKeyManager.unwrapDEK(
                            applicationContext, cryptoObject.cipher!!
                        )
                        BiometricVaultUnlocker.setUnlockedDek(unwrappedDEK)
                        unwrappedDEK.fill(0) // scrub key bytes

                        SecureLogger.i("UnlockVaultActivity: Vault session unlocked via biometric for domain=$domain")
                        TelemetryLogger.logEvent(
                            applicationContext,
                            TelemetryLogger.EventType.BIOMETRIC_SUCCESS,
                            domain
                        )

                        // Build the fill response in the background
                        CoroutineScope(Dispatchers.IO).launch {
                            try {
                                buildAndReturnFillResponse()
                            } catch (e: Exception) {
                                SecureLogger.e("UnlockVaultActivity: Error building fill response after unlock", e)
                                runOnUiThread { finish() }
                            }
                        }

                    } catch (e: Exception) {
                        SecureLogger.e("UnlockVaultActivity: Failed to unwrap DEK from biometric cipher", e)
                        TelemetryLogger.logEvent(
                            applicationContext,
                            TelemetryLogger.EventType.BIOMETRIC_FAILURE,
                            domain,
                            mapOf("reason" to "unwrap_failed", "message" to (e.message?.take(80) ?: "unknown"))
                        )
                        finishAndRemoveTask()
                    }
                }

                override fun onAuthenticationError(
                    errorCode: Int, errString: CharSequence
                ) {
                    super.onAuthenticationError(errorCode, errString)
                    SecureLogger.e("UnlockVaultActivity: Biometric error code=$errorCode")
                    TelemetryLogger.logEvent(
                        applicationContext,
                        TelemetryLogger.EventType.BIOMETRIC_FAILURE,
                        domain,
                        mapOf("error_code" to errorCode, "error_string" to errString.toString())
                    )
                    finishAndRemoveTask()
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    SecureLogger.w("UnlockVaultActivity: Biometric attempt failed (mismatch)")
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Keeguard")
            .setSubtitle("Autofill requires authentication")
            .setAllowedAuthenticators(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val cipher = BiometricKeyManager.getDecryptionCipher(this)
                biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            } else {
                Toast.makeText(
                    this, "Android 7.0+ is required for vault security", Toast.LENGTH_SHORT
                ).show()
                finishWithCancel()
            }
        } catch (e: Exception) {
            SecureLogger.e("UnlockVaultActivity: Failed to initialize biometric cipher — key may have been invalidated", e)
            Toast.makeText(
                this,
                "Re-enable biometric unlock in Keeguard (fingerprints changed)",
                Toast.LENGTH_LONG
            ).show()
            finishWithCancel()
        }
    }

    private suspend fun buildAndReturnFillResponse() {
        val locator = AutofillServiceLocator.getInstance(applicationContext)
        val repository = locator.credentialMatcher.vaultRepository

        // Targeted lookup replaces all in-memory full scanning and redundant tier checks!
        val matches = repository.findMatchingCredentials(domain)
        SecureLogger.i("UnlockVaultActivity: Targeted DB search for domain=$domain found ${matches.size} items")

        if (matches.isEmpty()) {
            SecureLogger.w("UnlockVaultActivity: No matching credentials in database for $domain")
            runOnUiThread {
                Toast.makeText(this@UnlockVaultActivity, "No credentials matching $domain found.", Toast.LENGTH_LONG).show()
                setResult(Activity.RESULT_CANCELED)
                finishAndRemoveTask()
            }
            return
        }

        val uIds = intent.getParcelableArrayListExtra<AutofillId>("USERNAME_IDS")
        val pIds = intent.getParcelableArrayListExtra<AutofillId>("PASSWORD_IDS")

        if (uIds == null && pIds == null) {
            SecureLogger.e("UnlockVaultActivity: AutofillIds are missing from intent!")
            runOnUiThread {
                Toast.makeText(this@UnlockVaultActivity, "Autofill error: missing field IDs", Toast.LENGTH_SHORT).show()
                setResult(Activity.RESULT_CANCELED)
                finishAndRemoveTask()
            }
            return
        }

        val responseBuilder = FillResponse.Builder()
        var datasetCount = 0

        for (cred in matches.sortedByDescending { it.lastUsedAt }) {
            val datasetBuilder = Dataset.Builder()
            val presentation = RemoteViews(packageName, R.layout.autofill_dataset)
            presentation.setTextViewText(
                R.id.text1,
                cred.username.ifEmpty { cred.title }.ifEmpty { "Keeguard" }
            )

            var datasetUsable = false

            // Fill username fields
            if (uIds != null) {
                for (id in uIds) {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.username), presentation)
                    datasetUsable = true
                }
            }

            // Fill password fields
            val passwordToFill = cred.password
            if (passwordToFill.isNotEmpty() && pIds != null) {
                for (id in pIds) {
                    datasetBuilder.setValue(id, AutofillValue.forText(passwordToFill), presentation)
                    datasetUsable = true
                }
            }

            if (datasetUsable) {
                responseBuilder.addDataset(datasetBuilder.build())
                datasetCount++
            }
        }

        if (datasetCount == 0) {
            SecureLogger.w("UnlockVaultActivity: No usable datasets could be built")
            runOnUiThread {
                Toast.makeText(this@UnlockVaultActivity, "No usable fields found for $domain", Toast.LENGTH_SHORT).show()
                setResult(Activity.RESULT_CANCELED)
                finishAndRemoveTask()
            }
            return
        }

        val resultIntent = Intent().apply {
            putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, responseBuilder.build())
        }

        SecureLogger.i("UnlockVaultActivity: Returning authentication results with $datasetCount datasets.")

        runOnUiThread {
            setResult(Activity.RESULT_OK, resultIntent)
            finish()
        }
    }

    private fun finishWithCancel() {
        setResult(RESULT_CANCELED)
        finishAndRemoveTask()
    }
}
