package com.mohdj.securevault.autofill

import com.mohdj.securevault.autofill.matcher.CredentialMatcher
import com.mohdj.securevault.autofill.matcher.VaultCredential
import com.mohdj.securevault.autofill.matcher.VaultRepository
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class CredentialMatcherTest {

    private val fakeRepo = object : VaultRepository {
        val creds = mutableListOf<VaultCredential>()

        override suspend fun findMatchingCredentials(target: String): List<VaultCredential> {
            return creds
        }

        override suspend fun saveCredential(credential: VaultCredential) {}
        override suspend fun updateCredentialPassword(id: String, newPassword: String) {}
        override suspend fun isVaultUnlocked(): Boolean = true
    }

    private val domainMatcher = DomainMatcher(null).apply {
        parsePSLLines("""
            com
            github.io
        """.trimIndent().lineSequence())
    }

    private val matcher = CredentialMatcher(fakeRepo, domainMatcher)

    @Test
    fun testFindMatches() = runBlocking {
        val form = ParsedForm(
            formType = FormType.LOGIN,
            sourcePackage = "com.github.android",
            canonicalIdentifier = "github.com"
        )

        fakeRepo.creds.clear()
        fakeRepo.creds.add(
            VaultCredential(
                id = "1",
                title = "Github",
                username = "mohd",
                password = "pwd",
                uris = listOf("https://github.com"),
                packageName = "com.github.android",
                categoryId = "",
                lastUsedAt = 100L,
                faviconUrl = null
            )
        )

        val matches = matcher.findMatches(form)
        assertEquals(1, matches.size)
        assertEquals("mohd", matches[0].username)
    }
}
