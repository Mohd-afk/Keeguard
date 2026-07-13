package com.mohdj.securevault.autofill.builder

import android.service.autofill.SaveInfo
import android.view.autofill.AutofillId
import com.mohdj.securevault.autofill.parser.FormType
import com.mohdj.securevault.autofill.parser.ParsedForm

class SaveInfoBuilder {

    fun build(parsedForm: ParsedForm): SaveInfo? {
        if (parsedForm.formType == FormType.CARD_PAYMENT) {
            val cardNum = parsedForm.cardNumberField ?: return null
            val required = arrayOf(cardNum.autofillId)
            val optional = listOfNotNull(
                parsedForm.cardHolderField?.autofillId,
                parsedForm.cardExpiryField?.autofillId,
                parsedForm.cardExpiryMonthField?.autofillId,
                parsedForm.cardExpiryYearField?.autofillId,
                parsedForm.cardCvvField?.autofillId
            ).toTypedArray()
            
            val builder = SaveInfo.Builder(SaveInfo.SAVE_DATA_TYPE_CREDIT_CARD, required)
            if (optional.isNotEmpty()) {
                builder.setOptionalIds(optional)
            }
            return builder
                .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
                .build()
        }

        if (parsedForm.formType == FormType.ADDRESS) {
            val street = parsedForm.addressStreetField ?: return null
            val required = arrayOf(street.autofillId)
            val optional = listOfNotNull(
                parsedForm.nameField?.autofillId,
                parsedForm.addressCityField?.autofillId,
                parsedForm.addressStateField?.autofillId,
                parsedForm.addressZipField?.autofillId,
                parsedForm.addressCountryField?.autofillId,
                parsedForm.phoneField?.autofillId,
                parsedForm.emailField?.autofillId
            ).toTypedArray()
            
            val builder = SaveInfo.Builder(SaveInfo.SAVE_DATA_TYPE_ADDRESS, required)
            if (optional.isNotEmpty()) {
                builder.setOptionalIds(optional)
            }
            return builder
                .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
                .build()
        }

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
