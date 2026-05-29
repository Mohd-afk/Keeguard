package com.mohdj.securevault.autofill.security

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.Signature
import com.mohdj.securevault.autofill.SecureLogger
import java.security.MessageDigest

object CallingAppVerifier {

    /**
     * Retrieves SHA-256 signature hashes of the given package name to protect against spoofing.
     */
    fun getAppSignatures(context: Context, packageName: String): List<String> {
        return try {
            val pm = context.packageManager
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                val packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                val signingInfo = packageInfo.signingInfo
                if (signingInfo != null) {
                    if (signingInfo.hasMultipleSigners()) {
                        signingInfo.apkContentsSigners.map { getSha256(it) }
                    } else {
                        signingInfo.signingCertificateHistory.map { getSha256(it) }
                    }
                } else emptyList()
            } else {
                @Suppress("DEPRECATION")
                val packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
                @Suppress("DEPRECATION")
                packageInfo.signatures?.map { getSha256(it) } ?: emptyList()
            }
        } catch (e: Exception) {
            SecureLogger.e("CallingAppVerifier: Error retrieving package signatures for: $packageName", e)
            emptyList()
        }
    }

    private fun getSha256(signature: Signature): String {
        return try {
            val md = MessageDigest.getInstance("SHA-256")
            val digest = md.digest(signature.toByteArray())
            digest.joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            ""
        }
    }
}
