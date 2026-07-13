package com.mohdj.securevault.autofill.parser

import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue

enum class FieldType {
    USERNAME, EMAIL, PASSWORD, NEW_PASSWORD, CONFIRM_PASSWORD, SEARCH, OTP, UNKNOWN,
    
    // Credit Cards
    CREDIT_CARD_NUMBER, CREDIT_CARD_EXPIRY, CREDIT_CARD_EXPIRY_MONTH, CREDIT_CARD_EXPIRY_YEAR, CREDIT_CARD_CVV, CREDIT_CARD_HOLDER,
    
    // Address fields
    ADDRESS_STREET, ADDRESS_CITY, ADDRESS_STATE, ADDRESS_ZIP, ADDRESS_COUNTRY,
    
    // Identity fields
    PHONE, NAME
}

data class ParsedField(
    val autofillId: AutofillId,
    val fieldType: FieldType,
    val currentValue: AutofillValue? = null,
    val htmlInputType: String? = null,
    val autofillHints: List<String> = emptyList()
)
