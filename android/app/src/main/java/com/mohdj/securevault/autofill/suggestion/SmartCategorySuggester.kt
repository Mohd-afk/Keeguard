// PURPOSE: Native Android Autofill service component for SmartCategorySuggester.
package com.mohdj.securevault.autofill.suggestion

import android.content.Context
import com.mohdj.securevault.autofill.parser.ParsedForm

data class CategoryMapping(val keywords: List<String>, val categoryKey: String)

class SmartCategorySuggester(
    private val context: Context,
    private val categoryRepository: CategoryRepository
) {
    // Signal map — categoryKey resolves to live category IDs at runtime
    private val signalMap = listOf(
        CategoryMapping(listOf("gmail","outlook","yahoo","proton","hotmail","zoho","icloud","mail","thunderbird"), "email"),
        CategoryMapping(listOf("facebook","instagram","twitter","x.com","linkedin","snapchat","tiktok","reddit","discord","whatsapp","telegram","threads"), "social_media"),
        CategoryMapping(listOf("steam","epicgames","battle.net","roblox","ea.com","ubisoft","playstation","xbox","gog.com","itch.io","valorant","minecraft"), "gaming"),
        CategoryMapping(listOf("hdfc","sbi","icici","axis","kotak","paypal","razorpay","stripe","paytm","phonepe","gpay","bank","zerodha","groww"), "banking"),
        CategoryMapping(listOf("netflix","spotify","youtube","hotstar","primevideo","apple.tv","jiocinema","zee5","sonyliv","disneyplus","hulu"), "entertainment"),
        CategoryMapping(listOf("github","gitlab","bitbucket","jira","atlassian","aws","azure","gcp","heroku","vercel","netlify","figma","notion","slack","linear"), "work"),
        CategoryMapping(listOf("amazon","flipkart","myntra","meesho","snapdeal","ebay","shopify","etsy","ajio","nykaa"), "shopping"),
        CategoryMapping(listOf("coursera","udemy","skillshare","edx","khanacademy","duolingo","byju"), "education")
    )

    // User-learned preferences: domain -> categoryId
    private val learnedPrefs: MutableMap<String, String> = loadLearnedPrefs()
    private val overrideCount: MutableMap<String, Int> = mutableMapOf()

    suspend fun suggest(parsedForm: ParsedForm): String? {
        val identifier = parsedForm.canonicalIdentifier

        // Check learned preference first
        learnedPrefs[identifier]?.let { return it }

        // Signal map matching
        val matchedKey = signalMap.firstOrNull { mapping ->
            mapping.keywords.any { keyword -> identifier.contains(keyword, ignoreCase = true) }
        }?.categoryKey

        if (matchedKey != null) {
            // Resolve to live category ID — if category was deleted, fall back to root
            return categoryRepository.getCategoryIdByKey(matchedKey)
                ?: categoryRepository.getRootPasswordsCategoryId()
        }

        return categoryRepository.getRootPasswordsCategoryId()
    }

    fun recordUserOverride(domain: String, chosenCategoryId: String) {
        val count = (overrideCount[domain] ?: 0) + 1
        overrideCount[domain] = count
        // After 3 manual overrides for same domain, persist as learned preference
        if (count >= 3) {
            learnedPrefs[domain] = chosenCategoryId
            persistLearnedPrefs()
        }
    }

    private fun loadLearnedPrefs(): MutableMap<String, String> {
        // Load from encrypted SharedPreferences (or regular since it's just category keys)
        val prefs = context.getSharedPreferences("kg_autofill_learned", Context.MODE_PRIVATE)
        return prefs.all.mapValues { it.value.toString() }.toMutableMap()
    }

    private fun persistLearnedPrefs() {
        val prefs = context.getSharedPreferences("kg_autofill_learned", Context.MODE_PRIVATE)
        prefs.edit().apply {
            clear()
            learnedPrefs.forEach { (k, v) -> putString(k, v) }
            apply()
        }
    }
}

interface CategoryRepository {
    suspend fun getCategoryIdByKey(key: String): String?
    suspend fun getRootPasswordsCategoryId(): String
}
