package com.mohdj.securevault.autofill.classifier

import android.app.assist.AssistStructure
import com.mohdj.securevault.autofill.BuildConfigProvider

class PackageExclusionGuard {
    private val hardcodedBlocklist = setOf(
        "com.google.android.googlequicksearchbox",
        "com.android.launcher",
        "com.android.systemui",
        "com.google.android.inputmethod.latin",
        "com.samsung.android.honeyboard"
    )
    private val systemPrefixes = listOf("com.android.", "android.", "com.google.android.inputmethod")
    private var userBlocklist: Set<String> = emptySet()

    fun shouldSkip(structure: AssistStructure): Boolean {
        val pkg = structure.activityComponent?.packageName ?: ""
        return shouldSkip(pkg)
    }

    /**
     * Visible for testing. Checks package blocklist rules directly without AssistStructure mocks.
     */
    fun shouldSkip(packageName: String): Boolean {
        if (packageName.isBlank()) return false
        if (packageName == BuildConfigProvider.applicationId) return true
        if (systemPrefixes.any { packageName.startsWith(it) }) return true
        if (packageName in hardcodedBlocklist) return true
        if (packageName in userBlocklist) return true
        return false
    }

    fun updateUserBlocklist(packages: Set<String>) { 
        userBlocklist = packages 
    }
}
