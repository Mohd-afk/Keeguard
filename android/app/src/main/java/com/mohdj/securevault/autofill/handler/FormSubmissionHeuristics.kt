// PURPOSE: Native Android Autofill service component for FormSubmissionHeuristics.
package com.mohdj.securevault.autofill.handler

import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm

object FormSubmissionHeuristics {
    fun shouldPromptSave(
        parsedForm: ParsedForm,
        username: String,
        password: String
    ): Boolean {
        // Validation: cannot prompt save without a password
        if (password.isBlank() || password.length < 4) return false
        
        // Exclude search pages
        if (parsedForm.formType == FormType.SEARCH) return false
        
        // Exclude specific common non-auth platforms
        val domain = parsedForm.webDomain?.lowercase() ?: ""
        if (domain.contains("search.google.com") || domain.contains("bing.com")) return false

        return true
    }
}
