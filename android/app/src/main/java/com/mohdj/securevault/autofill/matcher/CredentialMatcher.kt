package com.mohdj.securevault.autofill.matcher

import com.mohdj.securevault.autofill.DomainMatcher
import com.mohdj.securevault.autofill.parser.ParsedForm

class CredentialMatcher(
    val vaultRepository: VaultRepository,
    private val domainMatcher: DomainMatcher
) {
    constructor(vaultRepository: VaultRepository) : this(vaultRepository, DomainMatcher(null))

    suspend fun findMatches(parsedForm: ParsedForm): List<VaultCredential> {
        // canonicalIdentifier could be webDomain or sourcePackage
        val target = parsedForm.canonicalIdentifier
        val all = vaultRepository.getAllDecryptedCredentials()

        return all
            .map { cred -> 
                val lookupKey = cred.uri ?: cred.packageName
                val confidence = domainMatcher.calculateConfidence(target, lookupKey)
                cred to confidence
            }
            .filter { it.second > 0.0 }
            .sortedWith(compareByDescending<Pair<VaultCredential, Double>> { it.second }
                .thenByDescending { it.first.lastUsedAt }
                .thenBy { it.first.title })
            .map { it.first }
            .distinctBy { it.id }
    }

    suspend fun findByUsernameAndDomain(username: String, id: String): VaultCredential? {
        val all = vaultRepository.getAllDecryptedCredentials()
        return all.firstOrNull { cred ->
            cred.username.equals(username, ignoreCase = true) &&
            domainMatcher.calculateConfidence(id, cred.uri ?: cred.packageName) > 0.0
        }
    }
}
