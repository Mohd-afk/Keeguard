// PURPOSE: Native Android Autofill service component for AutofillVaultRepositoryAdapter.
package com.mohdj.securevault.autofill

import com.mohdj.securevault.autofill.matcher.VaultCredential
import com.mohdj.securevault.autofill.matcher.VaultRepository as AutofillVaultRepository
import com.mohdj.securevault.security.BiometricVaultUnlocker
import com.mohdj.securevault.vault.VaultItemEntity
import com.mohdj.securevault.vault.VaultRepository

/**
 * AutofillVaultRepositoryAdapter
 *
 * Bridges the new autofill module's [AutofillVaultRepository] interface with the
 * existing SQLCipher-backed [VaultRepository] / [VaultItemEntity] layer.
 *
 * Provides targeted, SQL-indexed lookups to protect memory and scale.
 */
class AutofillVaultRepositoryAdapter(
    private val repo: VaultRepository,
    private val domainMatcher: DomainMatcher
) : AutofillVaultRepository {

    override suspend fun findMatchingCredentials(target: String): List<VaultCredential> {
        val keywords = mutableSetOf<String>()
        val trimmedTarget = target.trim()
        
        if (trimmedTarget.isNotEmpty()) {
            keywords.add(trimmedTarget)
            
            // Normalize target domain if it has one
            val normalized = domainMatcher.normalize(trimmedTarget)
            if (!normalized.isNullOrBlank()) {
                keywords.add(normalized)
            }
            
            // If the target is an Android package, check mapped web domain
            val mapped = domainMatcher.getAppMapping(trimmedTarget)
            if (!mapped.isNullOrBlank()) {
                keywords.add(mapped)
                val normalizedMapped = domainMatcher.normalize(mapped)
                if (!normalizedMapped.isNullOrBlank()) {
                    keywords.add(normalizedMapped)
                }
            }
        }

        // Query database via SQL LIKE for each keyword
        val matchedEntities = mutableSetOf<VaultItemEntity>()
        for (kw in keywords) {
            try {
                val matches = repo.findByDomain(kw)
                matchedEntities.addAll(matches)
            } catch (e: Exception) {
                SecureLogger.e("Database targeted query error for keyword: $kw", e)
            }
        }

        // Map and return active items only
        return matchedEntities
            .filter { it.deletedAt == null }
            .map { it.toVaultCredential() }
    }

    override suspend fun getAllCredentials(): List<VaultCredential> {
        return try {
            repo.getAllActive().map { it.toVaultCredential() }
        } catch (e: Exception) {
            SecureLogger.e("Failed to get all active credentials", e)
            emptyList()
        }
    }

    override suspend fun isVaultUnlocked(): Boolean =
        BiometricVaultUnlocker.isVaultUnlocked()

    /**
     * Saves a new credential into the local SQLCipher DB.
     * Encodes multiple URIs as a JSON array string.
     */
    override suspend fun saveCredential(credential: VaultCredential) {
        val urisJson = if (credential.uris.isNotEmpty()) {
            credential.uris.joinToString(prefix = "[", postfix = "]", separator = ",") { "\"$it\"" }
        } else {
            ""
        }
        
        val entity = VaultItemEntity(
            id        = credential.id.ifBlank { java.util.UUID.randomUUID().toString() },
            title     = credential.title,
            username  = credential.username,
            password  = credential.password,
            uris      = urisJson,
            type      = if (credential.packageName != null) "App" else "Website",
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis(),
            deletedAt = null,
            addressJson = credential.addressJson,
            cardJson = credential.cardJson,
            identityJson = credential.identityJson
        )
        repo.insert(entity)
    }

    override suspend fun updateCredentialPassword(id: String, newPassword: String) {
        val all = repo.getAllActive()
        val existing = all.firstOrNull { it.id == id } ?: return
        val updated = existing.copy(
            password  = newPassword,
            updatedAt = System.currentTimeMillis()
        )
        repo.insert(updated)
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Parses the JSON array URI column (e.g. '["https://example.com"]')
     * into a list of individual URIs.
     */
    private fun parseUriList(urisJson: String): List<String> {
        val trimmed = urisJson.trim()
        if (trimmed.isEmpty()) return emptyList()
        if (trimmed.startsWith("[")) {
            return try {
                trimmed
                    .removePrefix("[").removeSuffix("]")
                    .split(",")
                    .map { it.trim().removeSurrounding("\"") }
                    .filter { it.isNotBlank() }
            } catch (e: Exception) {
                emptyList()
            }
        }
        return if (trimmed.isNotBlank()) listOf(trimmed) else emptyList()
    }

    private fun VaultItemEntity.toVaultCredential(): VaultCredential {
        val parsedUris = parseUriList(uris)
        
        val parsedPackageName = if (type == "App") {
            parsedUris.firstOrNull()?.removePrefix("androidapp://") ?: title
        } else {
            parsedUris.firstOrNull { it.startsWith("androidapp://") }?.removePrefix("androidapp://")
        }

        return VaultCredential(
            id          = id,
            title       = title,
            username    = username,
            password    = password,
            uris        = parsedUris,
            packageName = parsedPackageName,
            categoryId  = "",
            lastUsedAt  = updatedAt,
            faviconUrl  = null,
            addressJson = addressJson,
            cardJson = cardJson,
            identityJson = identityJson
        )
    }
}
