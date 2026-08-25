// PURPOSE: Native Android Autofill service component for VaultCredential.
package com.mohdj.securevault.autofill.matcher

data class VaultCredential(
    val id: String,
    val title: String,
    val username: String,
    val password: String,
    val uris: List<String>,
    val packageName: String?,
    val categoryId: String,
    val lastUsedAt: Long,
    val faviconUrl: String?,
    val addressJson: String? = null,
    val cardJson: String? = null,
    val identityJson: String? = null
)
