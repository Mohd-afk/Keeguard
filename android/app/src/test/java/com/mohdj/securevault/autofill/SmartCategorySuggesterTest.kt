package com.mohdj.securevault.autofill

import android.content.Context
import android.content.SharedPreferences
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm
import com.mohdj.securevault.autofill.suggestion.CategoryRepository
import com.mohdj.securevault.autofill.suggestion.SmartCategorySuggester
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`

class SmartCategorySuggesterTest {

    private val fakeCatRepo = object : CategoryRepository {
        override suspend fun getCategoryIdByKey(key: String): String? = "cat_$key"
        override suspend fun getRootPasswordsCategoryId(): String = "cat_passwords"
    }

    private lateinit var mockContext: Context
    private lateinit var suggester: SmartCategorySuggester

    @Before
    fun setUp() {
        mockContext = mock(Context::class.java)
        val mockPrefs = mock(SharedPreferences::class.java)
        `when`(mockPrefs.all).thenReturn(emptyMap<String, Any>())
        `when`(mockContext.getSharedPreferences("kg_autofill_learned", Context.MODE_PRIVATE))
            .thenReturn(mockPrefs)
        suggester = SmartCategorySuggester(mockContext, fakeCatRepo)
    }

    @Test
    fun testSuggestCategory() = runBlocking {
        val form = ParsedForm(
            formType = FormType.LOGIN,
            sourcePackage = "com.netflix.mediaclient",
            canonicalIdentifier = "netflix.com",
            webDomain = "netflix.com",
            usernameField = null,
            emailField = null,
            passwordField = null,
            newPasswordField = null,
            confirmPasswordField = null
        )
        
        val category = suggester.suggest(form)
        assertNotNull(category)
    }
}
