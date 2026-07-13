package com.mohdj.securevault.autofill

import android.content.Context
import com.mohdj.securevault.autofill.handler.SaveRequestHandler
import com.mohdj.securevault.autofill.matcher.CredentialMatcher
import com.mohdj.securevault.autofill.matcher.VaultCredential
import com.mohdj.securevault.autofill.matcher.VaultRepository
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm
import com.mohdj.securevault.autofill.suggestion.SmartCategorySuggester
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.Mockito.mock

class SaveRequestHandlerTest {

    private val fakeRepo = object : VaultRepository {
        override suspend fun findMatchingCredentials(target: String): List<VaultCredential> = emptyList()
        override suspend fun getAllCredentials(): List<VaultCredential> = emptyList()
        override suspend fun saveCredential(credential: VaultCredential) {}
        override suspend fun updateCredentialPassword(id: String, newPassword: String) {}
        override suspend fun isVaultUnlocked(): Boolean = true
    }

    private val domainMatcher = DomainMatcher(null)
    private val matcher = CredentialMatcher(fakeRepo, domainMatcher)
    private val mockContext = mock(Context::class.java)
    private val mockSuggester = mock(SmartCategorySuggester::class.java)

    @Test
    fun testEvaluateNewSave() = runBlocking {
        val handler = SaveRequestHandler(mockContext, matcher, fakeRepo, mockSuggester)

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

        val result = handler.evaluate(form, "user@netflix.com", "my_secure_password")
        assertTrue(result is SaveRequestHandler.SaveResult.NeedsNewSave)
    }
}
