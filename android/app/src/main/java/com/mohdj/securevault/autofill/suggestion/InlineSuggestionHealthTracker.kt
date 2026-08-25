// PURPOSE: Native Android Autofill service component for InlineSuggestionHealthTracker.
package com.mohdj.securevault.autofill.suggestion

import android.content.Context
import android.os.SystemClock
import com.mohdj.securevault.autofill.SecureLogger

class InlineSuggestionHealthTracker(private val context: Context) {
    
    private val prefs = context.getSharedPreferences("kg_inline_health", Context.MODE_PRIVATE)
    
    companion object {
        private const val MAX_FAILURES = 3
        private const val COOLDOWN_DURATION_MS = 10 * 60 * 1000 // 10 minutes
    }
    
    fun getActiveImePackage(): String {
        return try {
            val imeSetting = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.DEFAULT_INPUT_METHOD
            ) ?: return ""
            if (imeSetting.contains("/")) {
                imeSetting.split("/")[0]
            } else {
                imeSetting
            }
        } catch (e: Exception) {
            ""
        }
    }
    
    fun isInlineSupported(imePackage: String): Boolean {
        if (imePackage.isBlank()) return true
        
        val failureCount = prefs.getInt("fail_count_$imePackage", 0)
        val lastFailureTime = prefs.getLong("last_fail_time_$imePackage", 0L)
        
        if (failureCount >= MAX_FAILURES) {
            val elapsed = SystemClock.elapsedRealtime() - lastFailureTime
            if (elapsed < COOLDOWN_DURATION_MS) {
                SecureLogger.w("InlineSuggestionHealthTracker: Inline suggestions temporarily suppressed for $imePackage due to repeated failures (remaining: ${ (COOLDOWN_DURATION_MS - elapsed) / 1000 }s)")
                return false
            } else {
                reset(imePackage)
            }
        }
        return true
    }
    
    fun recordFailure(imePackage: String) {
        if (imePackage.isBlank()) return
        
        val failureCount = prefs.getInt("fail_count_$imePackage", 0) + 1
        prefs.edit().apply {
            putInt("fail_count_$imePackage", failureCount)
            putLong("last_fail_time_$imePackage", SystemClock.elapsedRealtime())
            apply()
        }
        SecureLogger.w("InlineSuggestionHealthTracker: Recorded inline suggestion failure for package: $imePackage (failure count: $failureCount)")
    }
    
    fun recordSuccess(imePackage: String) {
        reset(imePackage)
    }
    
    private fun reset(imePackage: String) {
        if (imePackage.isBlank()) return
        prefs.edit().apply {
            remove("fail_count_$imePackage")
            remove("last_fail_time_$imePackage")
            apply()
        }
    }
}
