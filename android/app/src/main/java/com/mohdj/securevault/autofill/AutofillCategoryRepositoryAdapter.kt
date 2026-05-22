package com.mohdj.securevault.autofill

import com.mohdj.securevault.autofill.suggestion.CategoryRepository

/**
 * AutofillCategoryRepositoryAdapter
 *
 * Implements the autofill module's [CategoryRepository] interface.
 *
 * In the current architecture, the category data lives in Firestore and is only
 * accessible from the JS/WebView layer. The native autofill context cannot make
 * live Firestore calls without breaking the service's coroutine/offline model.
 *
 * Strategy:
 *   - A hardcoded map covers the built-in default category keys that
 *     [SmartCategorySuggester] produces. These keys are resolved to stable
 *     string IDs that match what the JS vault uses for its default categories.
 *   - If no match is found, falls back to the root "Passwords" category ID.
 *   - The JS layer can override the final category at confirm-time via the
 *     [AutofillBridgePlugin.saveCredentialFromAutofill] call, so the native
 *     suggestion is a best-effort pre-selection only.
 *
 * Future improvement: The JS vault bridge plugin could push live category IDs
 * into SharedPreferences when the vault is unlocked, allowing this adapter
 * to resolve live IDs dynamically.
 */
class AutofillCategoryRepositoryAdapter : CategoryRepository {

    // Default category keys produced by SmartCategorySuggester → display names.
    // These IDs must match the actual Firestore category document IDs used by
    // the JS vault layer. If you rename categories, update this map accordingly.
    private val categoryKeyToId: Map<String, String> = mapOf(
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

    override suspend fun getCategoryIdByKey(key: String): String? =
        categoryKeyToId[key]

    override suspend fun getRootPasswordsCategoryId(): String =
        rootPasswordsCategoryId
}
