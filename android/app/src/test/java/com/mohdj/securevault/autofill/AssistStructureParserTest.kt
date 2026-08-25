// PURPOSE: Unit test suite verifying Android native AssistStructureParserTest logic.
package com.mohdj.securevault.autofill

import com.mohdj.securevault.autofill.parser.AssistStructureParser
import com.mohdj.securevault.autofill.parser.FieldType
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedField
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class AssistStructureParserTest {

    private val parser = AssistStructureParser()

    @Test
    fun testDomainExtraction() {
        val parserClass = parser.javaClass
        val method = parserClass.getDeclaredMethod("extractDomain", String::class.java)
        method.isAccessible = true

        assertEquals("google.com", method.invoke(parser, "https://www.google.com/search"))
        assertEquals("google.com", method.invoke(parser, "http://google.com?q=1"))
        assertEquals("github.com", method.invoke(parser, "github.com/login"))
    }
}
