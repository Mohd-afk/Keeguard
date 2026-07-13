package com.mohdj.securevault.autofill.parser

enum class FormType {
    LOGIN, REGISTRATION, CHANGE_PASSWORD, SEARCH, CARD_PAYMENT, ADDRESS, IDENTITY, UNKNOWN
}

data class ParsedForm(
    val formType: FormType,
    val usernameField: ParsedField? = null,
    val emailField: ParsedField? = null,
    val passwordField: ParsedField? = null,
    val newPasswordField: ParsedField? = null,
    val confirmPasswordField: ParsedField? = null,
    
    // Credit Cards
    val cardNumberField: ParsedField? = null,
    val cardExpiryField: ParsedField? = null,
    val cardExpiryMonthField: ParsedField? = null,
    val cardExpiryYearField: ParsedField? = null,
    val cardCvvField: ParsedField? = null,
    val cardHolderField: ParsedField? = null,
    
    // Address fields
    val addressStreetField: ParsedField? = null,
    val addressCityField: ParsedField? = null,
    val addressStateField: ParsedField? = null,
    val addressZipField: ParsedField? = null,
    val addressCountryField: ParsedField? = null,
    
    // Identity fields
    val phoneField: ParsedField? = null,
    val nameField: ParsedField? = null,
    
    val sourcePackage: String,
    val webDomain: String? = null,
    val canonicalIdentifier: String
) {
    val hasPasswordField: Boolean get() = passwordField != null
    val allAutofillIds get() = listOfNotNull(
        usernameField?.autofillId,
        emailField?.autofillId,
        passwordField?.autofillId,
        newPasswordField?.autofillId,
        confirmPasswordField?.autofillId,
        cardNumberField?.autofillId,
        cardExpiryField?.autofillId,
        cardExpiryMonthField?.autofillId,
        cardExpiryYearField?.autofillId,
        cardCvvField?.autofillId,
        cardHolderField?.autofillId,
        addressStreetField?.autofillId,
        addressCityField?.autofillId,
        addressStateField?.autofillId,
        addressZipField?.autofillId,
        addressCountryField?.autofillId,
        phoneField?.autofillId,
        nameField?.autofillId
    ).toTypedArray()
}
