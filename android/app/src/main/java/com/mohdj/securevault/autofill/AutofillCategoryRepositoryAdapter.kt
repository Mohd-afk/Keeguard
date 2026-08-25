// PURPOSE: Native Android Autofill service component for AutofillCategoryRepositoryAdapter.
package com.mohdj.securevault.autofill

import android.content.Context
import com.mohdj.securevault.autofill.security.CategorySyncSecurity
import com.mohdj.securevault.autofill.suggestion.CategoryRepository
import org.json.JSONObject

class AutofillCategoryRepositoryAdapter(private val context: Context) : CategoryRepository {

    private val defaultCategoryKeyToId: Map<String, String> = mapOf(
        "email"          to "cat_email",
        "social_media"   to "cat_social",
        "gaming"         to "cat_gaming",
        "banking"        to "cat_banking",
        "entertainment"  to "cat_entertainment",
        "work"           to "cat_work",
        "shopping"       to "cat_shopping",
        "education"      to "cat_education"
    )

    private val rootPasswordsCategoryId = "cat_passwords"

    override suspend fun getCategoryIdByKey(key: String): String? {
        // Attempt to load dynamic categories from SharedPreferences
        val prefs = context.getSharedPreferences("kg_live_categories", Context.MODE_PRIVATE)
        val payload = prefs.getString("categories_payload", null)
        val hmac = prefs.getString("categories_hmac", null)

        if (!payload.isNullOrBlank() && !hmac.isNullOrBlank()) {
            // Verify HMAC signature before using payload
            if (CategorySyncSecurity.verifyHmac(payload, hmac)) {
                try {
                    val json = JSONObject(payload)
                    if (json.has(key)) {
                        val dynamicId = json.getString(key)
                        if (dynamicId.isNotEmpty()) {
                            return dynamicId
                        }
                    }
                } catch (e: Exception) {
                    SecureLogger.e("AutofillCategoryRepositoryAdapter: JSON parsing of sync categories failed", e)
                }
            } else {
                SecureLogger.w("AutofillCategoryRepositoryAdapter: HMAC signature verification failed for sync categories! Falling back to defaults.")
            }
        }

        return defaultCategoryKeyToId[key]
    }

    override suspend fun getRootPasswordsCategoryId(): String =
        rootPasswordsCategoryId
}
