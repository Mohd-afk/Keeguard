// PURPOSE: Native Android Autofill service component for VaultRepository.
package com.mohdj.securevault.autofill.matcher

interface VaultRepository {
    suspend fun findMatchingCredentials(target: String): List<VaultCredential>
    suspend fun getAllCredentials(): List<VaultCredential>
    suspend fun saveCredential(credential: VaultCredential)
    suspend fun updateCredentialPassword(id: String, newPassword: String)
    suspend fun isVaultUnlocked(): Boolean
}
