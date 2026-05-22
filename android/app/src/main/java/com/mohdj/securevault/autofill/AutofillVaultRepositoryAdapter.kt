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
 * Vault lock state is delegated to [BiometricVaultUnlocker] which is the
 * single source of truth for the unlock session in the native layer.
 */
class AutofillVaultRepositoryAdapter(
    private val repo: VaultRepository
) : AutofillVaultRepository {

    override suspend fun getAllDecryptedCredentials(): List<VaultCredential> {
        return repo.getAllActive()
            .filter { it.deletedAt == null }
            .map { it.toVaultCredential() }
    }

    override suspend fun isVaultUnlocked(): Boolean =
        BiometricVaultUnlocker.isVaultUnlocked()

    /**
     * Saves a new credential into the local SQLCipher DB.
     * This is called after the user confirms a save in the JS bottom sheet.
     */
    override suspend fun saveCredential(credential: VaultCredential) {
        val entity = VaultItemEntity(
            id        = credential.id.ifBlank { java.util.UUID.randomUUID().toString() },
            title     = credential.title,
            username  = credential.username,
            password  = credential.password,
            uris      = credential.uri?.let { "[\"$it\"]" } ?: "",
            type      = if (credential.packageName != null) "App" else "Website",
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis(),
            deletedAt = null
        )
        repo.insert(entity)
    }

    /**
     * Updates the password for an existing credential by id.
     * A full-table scan is used since [VaultDao] doesn't expose a direct
     * update-by-id method. This is infrequent (only called on save "update" action).
     */
    override suspend fun updateCredentialPassword(id: String, newPassword: String) {
        val all = repo.getAllActive()
        val existing = all.firstOrNull { it.id == id } ?: return
        val updated = existing.copy(
            password  = newPassword,
            updatedAt = System.currentTimeMillis()
        )
        repo.insert(updated) // REPLACE on conflict strategy handles the upsert
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Parses the JSON array URI column (e.g. '["https://example.com"]')
     * and returns the first URI entry, or null if empty / unparseable.
     */
    private fun parseFirstUri(urisJson: String): String? {
        val trimmed = urisJson.trim()
        if (trimmed.startsWith("[")) {
            return try {
                trimmed
                    .removePrefix("[").removeSuffix("]")
                    .split(",")
                    .firstOrNull()
                    ?.trim()
                    ?.removeSurrounding("\"")
                    ?.takeIf { it.isNotBlank() }
            } catch (e: Exception) { null }
        }
        return if (trimmed.isNotBlank()) trimmed else null
    }

    private fun VaultItemEntity.toVaultCredential() = VaultCredential(
        id          = id,
        title       = title,
        username    = username,
        password    = password,
        uri         = parseFirstUri(uris),
        packageName = null,
        categoryId  = "",
        lastUsedAt  = updatedAt,
        faviconUrl  = null
    )
}
