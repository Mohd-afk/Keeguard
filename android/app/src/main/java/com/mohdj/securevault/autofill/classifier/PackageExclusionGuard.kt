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
        val pkg = structure.activityComponent.packageName
        // Rule 1: ALWAYS skip our own app — fixes unlock prompt on our own search/master-password fields
        if (pkg == BuildConfigProvider.applicationId) return true
        if (systemPrefixes.any { pkg.startsWith(it) }) return true
        if (pkg in hardcodedBlocklist) return true
        if (pkg in userBlocklist) return true
        return false
    }

    fun updateUserBlocklist(packages: Set<String>) { userBlocklist = packages }
}
