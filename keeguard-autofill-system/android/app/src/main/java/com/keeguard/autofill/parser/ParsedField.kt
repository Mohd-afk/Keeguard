package com.keeguard.autofill.parser

import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue

enum class FieldType {
    USERNAME, EMAIL, PASSWORD, NEW_PASSWORD, CONFIRM_PASSWORD, SEARCH, OTP, UNKNOWN
}

data class ParsedField(
    val autofillId: AutofillId,
    val fieldType: FieldType,
    val currentValue: AutofillValue? = null,
    val htmlInputType: String? = null,
    val autofillHints: List<String> = emptyList()
)
