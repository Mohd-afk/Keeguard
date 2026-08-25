// PURPOSE: Native Android Autofill service component for CategorySyncSecurity.
package com.mohdj.securevault.autofill.security

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object CategorySyncSecurity {
    private val sessionKey: ByteArray = ByteArray(32).apply {
        SecureRandom().nextBytes(this)
    }

    fun calculateHmac(payload: String): String {
        return try {
            val mac = Mac.getInstance("HmacSHA256")
            val keySpec = SecretKeySpec(sessionKey, "HmacSHA256")
            mac.init(keySpec)
            val bytes = mac.doFinal(payload.toByteArray(Charsets.UTF_8))
            Base64.encodeToString(bytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            ""
        }
    }

    fun verifyHmac(payload: String, hmac: String): Boolean {
        if (hmac.isBlank()) return false
        val calculated = calculateHmac(payload)
        return try {
            MessageDigest.isEqual(
                Base64.decode(calculated, Base64.NO_WRAP),
                Base64.decode(hmac, Base64.NO_WRAP)
            )
        } catch (e: Exception) {
            false
        }
    }
}
