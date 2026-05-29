package com.mohdj.securevault.autofill.builder

import android.service.autofill.SaveInfo
import android.view.autofill.AutofillId
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm

class SaveInfoBuilder {

    fun build(parsedForm: ParsedForm): SaveInfo? {
        val identityField = parsedForm.usernameField ?: parsedForm.emailField
        val passwordField = parsedForm.passwordField ?: parsedForm.newPasswordField
            ?: return null  // Cannot save without a password or new password field

        val requiredIds = mutableListOf<AutofillId>()
        requiredIds.add(passwordField.autofillId)
        
        val optionalIds = mutableListOf<AutofillId>()
        identityField?.let { optionalIds.add(it.autofillId) }

        val saveType = when (parsedForm.formType) {
            FormType.LOGIN -> SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_PASSWORD
            FormType.REGISTRATION -> SaveInfo.SAVE_DATA_TYPE_USERNAME or
                    SaveInfo.SAVE_DATA_TYPE_PASSWORD or SaveInfo.SAVE_DATA_TYPE_EMAIL_ADDRESS
            FormType.CHANGE_PASSWORD -> SaveInfo.SAVE_DATA_TYPE_PASSWORD
            else -> return null
        }

        val builder = SaveInfo.Builder(saveType, requiredIds.toTypedArray())
        if (optionalIds.isNotEmpty()) {
            builder.setOptionalIds(optionalIds.toTypedArray())
        }
        
        return builder
            .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
            .build()
    }
}
