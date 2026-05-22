package com.mohdj.securevault.autofill.matcher

data class VaultCredential(
    val id: String,
    val title: String,
    val username: String,
    val password: String,
    val uri: String?,
    val packageName: String?,
    val categoryId: String,
    val lastUsedAt: Long,
    val faviconUrl: String?
)
