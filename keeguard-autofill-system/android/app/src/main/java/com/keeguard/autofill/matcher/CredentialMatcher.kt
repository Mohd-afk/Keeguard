package com.keeguard.autofill.matcher

import com.keeguard.autofill.parser.ParsedForm

class CredentialMatcher(private val vaultRepository: VaultRepository) {

    suspend fun findMatches(parsedForm: ParsedForm): List<VaultCredential> {
        val identifier = parsedForm.canonicalIdentifier
        val all = vaultRepository.getAllDecryptedCredentials()

        val exact = all.filter { it.uri?.normalizeDomain() == identifier || it.packageName == identifier }
        val subdomain = if (exact.isEmpty()) all.filter {
            val d = it.uri?.normalizeDomain() ?: return@filter false
            identifier.endsWith(d) || d.endsWith(identifier)
        } else emptyList()
        val byPackage = if (exact.isEmpty() && subdomain.isEmpty() && parsedForm.webDomain == null)
            all.filter { it.packageName == parsedForm.sourcePackage } else emptyList()

        return (exact + subdomain + byPackage)
            .distinctBy { it.id }
            .sortedWith(compareByDescending<VaultCredential> { it.uri?.normalizeDomain() == identifier }
                .thenByDescending { it.lastUsedAt }
                .thenBy { it.title })
    }

    suspend fun findByUsernameAndDomain(username: String, id: String): VaultCredential? =
        vaultRepository.getAllDecryptedCredentials().firstOrNull {
            it.username.equals(username, ignoreCase = true) &&
            (it.uri?.normalizeDomain() == id || it.packageName == id)
        }

    private fun String.normalizeDomain(): String = this.lowercase()
        .removePrefix("https://").removePrefix("http://").removePrefix("www.")
        .split("/").first().split("?").first()
        .let { c -> c.split(".").let { p -> if (p.size >= 2) "\${p[p.size-2]}.\${p.last()}" else c } }
}
