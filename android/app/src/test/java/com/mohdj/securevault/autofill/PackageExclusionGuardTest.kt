// PURPOSE: Unit test suite verifying Android native PackageExclusionGuardTest logic.
package com.mohdj.securevault.autofill

import com.mohdj.securevault.autofill.classifier.PackageExclusionGuard
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PackageExclusionGuardTest {

    private val guard = PackageExclusionGuard()

    @Test
    fun testBlocklistChecks() {
        guard.updateUserBlocklist(setOf("com.user.blocked"))
        
        // Blocked items
        assertTrue(guard.shouldSkip("com.mohdj.securevault")) // own app
        assertTrue(guard.shouldSkip("com.android.systemui"))  // system UI
        assertTrue(guard.shouldSkip("com.android.launcher"))  // system prefix
        assertTrue(guard.shouldSkip("com.user.blocked"))      // user blocked

        // Allowed items
        assertFalse(guard.shouldSkip("com.instagram.android"))
        assertFalse(guard.shouldSkip("com.netflix.mediaclient"))
    }
}
