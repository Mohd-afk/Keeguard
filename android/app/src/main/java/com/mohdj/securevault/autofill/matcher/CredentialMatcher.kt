package com.mohdj.securevault.autofill.matcher

import com.mohdj.securevault.autofill.DomainMatcher
import com.mohdj.securevault.autofill.parser.ParsedForm

class CredentialMatcher(
    val vaultRepository: VaultRepository,
    private val domainMatcher: DomainMatcher
) {
    constructor(vaultRepository: VaultRepository) : this(vaultRepository, DomainMatcher(null))

    suspend fun findMatches(parsedForm: ParsedForm): List<VaultCredential> {
        val target = parsedForm.canonicalIdentifier
        val matches = vaultRepository.findMatchingCredentials(target)

        return matches
            .map { cred -> 
                val confidence = cred.uris.maxOfOrNull { uri ->
                    domainMatcher.calculateConfidence(target, uri)
                } ?: (cred.packageName?.let { domainMatcher.calculateConfidence(target, it) } ?: 0.0)
                
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
        val matches = vaultRepository.findMatchingCredentials(id)
        return matches.firstOrNull { cred ->
            cred.username.equals(username, ignoreCase = true) &&
            (cred.uris.any { domainMatcher.calculateConfidence(id, it) > 0.0 } ||
             (cred.packageName?.let { domainMatcher.calculateConfidence(id, it) > 0.0 } ?: false))
        }
    }
}
