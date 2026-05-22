package com.keeguard.autofill.builder

import android.service.autofill.SaveInfo
import android.view.autofill.AutofillId
import com.keeguard.autofill.parser.FormType
import com.keeguard.autofill.parser.ParsedForm

class SaveInfoBuilder {

    fun build(parsedForm: ParsedForm): SaveInfo? {
        val requiredIds = mutableListOf<AutofillId>()
        parsedForm.usernameField?.let { requiredIds.add(it.autofillId) }
        parsedForm.passwordField?.let { requiredIds.add(it.autofillId) }

        // Need at least a password field to build SaveInfo
        if (parsedForm.passwordField == null) return null
        if (requiredIds.isEmpty()) return null

        val saveType = when (parsedForm.formType) {
            FormType.LOGIN -> SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_PASSWORD
            FormType.REGISTRATION -> SaveInfo.SAVE_DATA_TYPE_USERNAME or
                    SaveInfo.SAVE_DATA_TYPE_PASSWORD or SaveInfo.SAVE_DATA_TYPE_EMAIL_ADDRESS
            FormType.CHANGE_PASSWORD -> SaveInfo.SAVE_DATA_TYPE_PASSWORD
            else -> return null
        }

        return SaveInfo.Builder(saveType, requiredIds.toTypedArray())
            .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
            .build()
    }
}
