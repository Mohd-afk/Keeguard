// PURPOSE: Native Android Autofill service component for SecureLogger.
package com.mohdj.securevault.autofill

import android.content.Context
import android.util.Log
import java.security.MessageDigest

object SecureLogger {
    private const val TAG = "KeeguardAutofill"
    private var isDebug: Boolean = false

    fun init(context: Context) {
        isDebug = BuildConfigProvider.isDebug(context)
    }

    fun d(message: String) {
        if (isDebug) {
            Log.d(TAG, redact(message))
        }
    }

    fun i(message: String) {
        val redacted = redact(message)
        if (isDebug) {
            Log.i(TAG, redacted)
        } else {
            if (isProductionSafe(redacted)) {
                Log.i(TAG, redacted)
            }
        }
    }

    fun w(message: String) {
        Log.w(TAG, redact(message))
    }

    fun e(message: String, throwable: Throwable? = null) {
        val redacted = redact(message)
        if (throwable != null) {
            Log.e(TAG, redacted, throwable)
        } else {
            Log.e(TAG, redacted)
        }
    }

    /**
     * Redacts potential sensitive data in log strings.
     */
    fun redact(msg: String): String {
        var result = msg
        // Redact email addresses
        result = result.replace(Regex("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"), "[REDACTED_EMAIL]")
        // Redact potential passwords (e.g. password=abc, pass=xyz, value=123)
        result = result.replace(Regex("(?i)(password|pass|passwd|secret|val|value|pwd|textValue)\\s*=\\s*['\"]?[^\\s'\"]+['\"]?"), "$1=[REDACTED]")
        // Redact credit card numbers
        result = result.replace(Regex("\\b(?:\\d[ -]*?){13,16}\\b"), "[REDACTED_CARD]")
        return result
    }

    private fun isProductionSafe(msg: String): Boolean {
        val safePatterns = listOf(
            "Service created",
            "AUTOFILL_REQUEST_RECEIVED",
            "AUTOFILL_SUPPRESSED_REASON",
            "AUTOFILL_FILL_RESPONSE_SENT",
            "AUTOFILL_SAVE_REQUEST_RECEIVED",
            "AUTOFILL_SAVE_EVALUATED"
        )
        return safePatterns.any { msg.contains(it) }
    }
}
