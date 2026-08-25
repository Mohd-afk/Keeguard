// PURPOSE: Unit test suite verifying Android native SaveInfoBuilderTest logic.
package com.mohdj.securevault.autofill

import com.mohdj.securevault.autofill.builder.SaveInfoBuilder
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class SaveInfoBuilderTest {

    private val builder = SaveInfoBuilder()

    @Test
    fun testBuildSaveInfo() {
        val form = ParsedForm(
            formType = FormType.LOGIN,
            sourcePackage = "com.netflix.mediaclient",
            canonicalIdentifier = "netflix.com"
        )
        // Null when password is missing
        assertNull(builder.build(form))
    }
}
