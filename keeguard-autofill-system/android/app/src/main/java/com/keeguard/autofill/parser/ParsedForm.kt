package com.keeguard.autofill.parser

enum class FormType {
    LOGIN, REGISTRATION, CHANGE_PASSWORD, SEARCH, UNKNOWN
}

data class ParsedForm(
    val formType: FormType,
    val usernameField: ParsedField? = null,
    val passwordField: ParsedField? = null,
    val newPasswordField: ParsedField? = null,
    val confirmPasswordField: ParsedField? = null,
    val sourcePackage: String,
    val webDomain: String? = null,
    val canonicalIdentifier: String
) {
    val hasPasswordField: Boolean get() = passwordField != null
    val allAutofillIds get() = listOfNotNull(
        usernameField?.autofillId,
        passwordField?.autofillId,
        newPasswordField?.autofillId,
        confirmPasswordField?.autofillId
    ).toTypedArray()
}
