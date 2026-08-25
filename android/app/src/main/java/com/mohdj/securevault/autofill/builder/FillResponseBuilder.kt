// PURPOSE: Native Android Autofill service component for FillResponseBuilder.
package com.mohdj.securevault.autofill.builder

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.service.autofill.InlinePresentation
import android.service.autofill.SaveInfo
import android.util.Size
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import android.widget.inline.InlinePresentationSpec
import androidx.annotation.RequiresApi
import androidx.autofill.inline.v1.InlineSuggestionUi
import androidx.autofill.inline.v1.InlineSuggestionUi.newContentBuilder
import com.mohdj.securevault.R
import com.mohdj.securevault.autofill.AutofillCapabilityMatrix
import com.mohdj.securevault.autofill.SecureLogger
import com.mohdj.securevault.autofill.matcher.VaultCredential
import com.mohdj.securevault.autofill.parser.ParsedForm

class FillResponseBuilder(private val context: Context) {

    /**
     * Builds a locked-vault dataset (single entry, authentication required).
     */
    fun buildLockedResponse(
        parsedForm: ParsedForm, 
        unlockIntent: Intent, 
        requestCode: Int
    ): FillResponse {
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            unlockIntent,
            AutofillCapabilityMatrix.getRequestCodeFlags()
        )

        val presentation = RemoteViews(context.packageName, R.layout.autofill_dataset_locked)
        presentation.setTextViewText(R.id.text1, "Unlock Keeguard")

        val lockedDatasetBuilder = Dataset.Builder()
        lockedDatasetBuilder.setAuthentication(pendingIntent.intentSender)

        parsedForm.usernameField?.autofillId?.let { lockedDatasetBuilder.setValue(it, null, presentation) }
        parsedForm.emailField?.autofillId?.let { lockedDatasetBuilder.setValue(it, null, presentation) }
        parsedForm.passwordField?.autofillId?.let { lockedDatasetBuilder.setValue(it, null, presentation) }
        parsedForm.newPasswordField?.autofillId?.let { lockedDatasetBuilder.setValue(it, null, presentation) }

        return FillResponse.Builder()
            .addDataset(lockedDatasetBuilder.build())
            .build()
    }

    /**
     * Builds filled datasets for matched credentials.
     * Supports both classic RemoteViews and InlinePresentation (Android 11+).
     */
    fun buildFilledResponse(
        parsedForm: ParsedForm,
        credentials: List<VaultCredential>,
        saveInfo: SaveInfo?,
        inlineSpecs: List<InlinePresentationSpec>?,
        isInlineAllowed: Boolean
    ): FillResponse {
        val responseBuilder = FillResponse.Builder()
        var datasetCount = 0

        for (cred in credentials) {
            val datasetBuilder = Dataset.Builder()
            val presentation = RemoteViews(context.packageName, R.layout.autofill_dataset)
            
            // Format presentation text based on type
            val titleText = when (parsedForm.formType) {
                com.mohdj.securevault.autofill.parser.FormType.CARD_PAYMENT -> {
                    val cardJson = cred.cardJson
                    if (!cardJson.isNullOrEmpty()) {
                        val cardObj = org.json.JSONObject(cardJson)
                        val num = cardObj.optString("number", "")
                        val brand = cardObj.optString("brand", "Card")
                        val last4 = if (num.length >= 4) num.substring(num.length - 4) else ""
                        if (last4.isNotEmpty()) "$brand •••• $last4" else brand
                    } else {
                        cred.title
                    }
                }
                com.mohdj.securevault.autofill.parser.FormType.ADDRESS -> {
                    val addressJson = cred.addressJson
                    if (!addressJson.isNullOrEmpty()) {
                        val addrObj = org.json.JSONObject(addressJson)
                        val street = addrObj.optString("streetAddress", "")
                        val name = addrObj.optString("fullName", "")
                        if (street.isNotEmpty()) "$street ($name)" else name
                    } else {
                        cred.title
                    }
                }
                else -> cred.username.ifEmpty { cred.title }.ifEmpty { "Keeguard" }
            }
            
            presentation.setTextViewText(R.id.text1, titleText)

            // Attempt to build inline presentation if specs are provided and allowed
            var inlinePresentation: InlinePresentation? = null
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineSpecs != null && inlineSpecs.isNotEmpty() && isInlineAllowed) {
                val inlineSpec = inlineSpecs[0]
                inlinePresentation = buildInlinePresentation(inlineSpec, cred, titleText)
            }

            var datasetUsable = false

            fun setValueSafely(id: AutofillId, value: AutofillValue) {
                if (inlinePresentation != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    datasetBuilder.setValue(id, value, presentation, inlinePresentation)
                } else {
                    datasetBuilder.setValue(id, value, presentation)
                }
                datasetUsable = true
            }

            // Fill based on form type
            when (parsedForm.formType) {
                com.mohdj.securevault.autofill.parser.FormType.CARD_PAYMENT -> {
                    val cardJson = cred.cardJson
                    if (!cardJson.isNullOrEmpty()) {
                        try {
                            val cardObj = org.json.JSONObject(cardJson)
                            val cardNumber = cardObj.optString("number", "")
                            val cardholderName = cardObj.optString("cardholderName", "")
                            val expMonth = cardObj.optString("expMonth", "")
                            val expYear = cardObj.optString("expYear", "")
                            val cvv = cardObj.optString("cvv", "")

                            parsedForm.cardNumberField?.autofillId?.let { id ->
                                if (cardNumber.isNotEmpty()) setValueSafely(id, AutofillValue.forText(cardNumber))
                            }
                            parsedForm.cardHolderField?.autofillId?.let { id ->
                                if (cardholderName.isNotEmpty()) setValueSafely(id, AutofillValue.forText(cardholderName))
                            }
                            parsedForm.cardExpiryMonthField?.autofillId?.let { id ->
                                if (expMonth.isNotEmpty()) setValueSafely(id, AutofillValue.forText(expMonth))
                            }
                            parsedForm.cardExpiryYearField?.autofillId?.let { id ->
                                if (expYear.isNotEmpty()) setValueSafely(id, AutofillValue.forText(expYear))
                            }
                            parsedForm.cardCvvField?.autofillId?.let { id ->
                                if (cvv.isNotEmpty()) setValueSafely(id, AutofillValue.forText(cvv))
                            }
                            parsedForm.cardExpiryField?.autofillId?.let { id ->
                                val expDate = if (expMonth.isNotEmpty() && expYear.isNotEmpty()) "$expMonth/$expYear" else ""
                                if (expDate.isNotEmpty()) setValueSafely(id, AutofillValue.forText(expDate))
                            }
                        } catch (e: Exception) {
                            SecureLogger.e("Error filling card form", e)
                        }
                    }
                }
                com.mohdj.securevault.autofill.parser.FormType.ADDRESS -> {
                    val addressJson = cred.addressJson
                    if (!addressJson.isNullOrEmpty()) {
                        try {
                            val addrObj = org.json.JSONObject(addressJson)
                            val fullName = addrObj.optString("fullName", "")
                            val organization = addrObj.optString("organization", "")
                            val street = addrObj.optString("streetAddress", "")
                            val street2 = addrObj.optString("streetAddress2", "")
                            val city = addrObj.optString("city", "")
                            val state = addrObj.optString("state", "")
                            val zip = addrObj.optString("postalCode", "")
                            val country = addrObj.optString("country", "")
                            val phone = addrObj.optString("phone", "")
                            val email = addrObj.optString("email", "")

                            parsedForm.addressStreetField?.autofillId?.let { id ->
                                val fullStreet = if (street2.isNotEmpty()) "$street, $street2" else street
                                if (fullStreet.isNotEmpty()) setValueSafely(id, AutofillValue.forText(fullStreet))
                            }
                            parsedForm.addressCityField?.autofillId?.let { id ->
                                if (city.isNotEmpty()) setValueSafely(id, AutofillValue.forText(city))
                            }
                            parsedForm.addressStateField?.autofillId?.let { id ->
                                if (state.isNotEmpty()) setValueSafely(id, AutofillValue.forText(state))
                            }
                            parsedForm.addressZipField?.autofillId?.let { id ->
                                if (zip.isNotEmpty()) setValueSafely(id, AutofillValue.forText(zip))
                            }
                            parsedForm.addressCountryField?.autofillId?.let { id ->
                                if (country.isNotEmpty()) setValueSafely(id, AutofillValue.forText(country))
                            }
                            parsedForm.nameField?.autofillId?.let { id ->
                                if (fullName.isNotEmpty()) setValueSafely(id, AutofillValue.forText(fullName))
                            }
                            parsedForm.phoneField?.autofillId?.let { id ->
                                if (phone.isNotEmpty()) setValueSafely(id, AutofillValue.forText(phone))
                            }
                            parsedForm.emailField?.autofillId?.let { id ->
                                if (email.isNotEmpty()) setValueSafely(id, AutofillValue.forText(email))
                            }
                        } catch (e: Exception) {
                            SecureLogger.e("Error filling address form", e)
                        }
                    }
                }
                com.mohdj.securevault.autofill.parser.FormType.IDENTITY -> {
                    val identityJson = cred.identityJson
                    if (!identityJson.isNullOrEmpty()) {
                        try {
                            val idObj = org.json.JSONObject(identityJson)
                            val firstName = idObj.optString("firstName", "")
                            val lastName = idObj.optString("lastName", "")
                            val email = idObj.optString("email", "")
                            val phone = idObj.optString("phone", "")

                            parsedForm.nameField?.autofillId?.let { id ->
                                val fullName = "$firstName $lastName".trim()
                                if (fullName.isNotEmpty()) setValueSafely(id, AutofillValue.forText(fullName))
                            }
                            parsedForm.emailField?.autofillId?.let { id ->
                                if (email.isNotEmpty()) setValueSafely(id, AutofillValue.forText(email))
                            }
                            parsedForm.phoneField?.autofillId?.let { id ->
                                if (phone.isNotEmpty()) setValueSafely(id, AutofillValue.forText(phone))
                            }
                        } catch (e: Exception) {
                            SecureLogger.e("Error filling identity form", e)
                        }
                    }
                }
                else -> {
                    // Standard login/signup logic
                    parsedForm.usernameField?.autofillId?.let { id ->
                        setValueSafely(id, AutofillValue.forText(cred.username))
                    }
                    parsedForm.emailField?.autofillId?.let { id ->
                        setValueSafely(id, AutofillValue.forText(cred.username))
                    }
                    parsedForm.passwordField?.autofillId?.let { id ->
                        setValueSafely(id, AutofillValue.forText(cred.password))
                    }
                    parsedForm.newPasswordField?.autofillId?.let { id ->
                        setValueSafely(id, AutofillValue.forText(cred.password))
                    }
                }
            }

            if (datasetUsable) {
                responseBuilder.addDataset(datasetBuilder.build())
                datasetCount++
            }
        }

        if (saveInfo != null) {
            responseBuilder.setSaveInfo(saveInfo)
        }

        SecureLogger.d("FillResponseBuilder: Built response with $datasetCount datasets.")
        return responseBuilder.build()
    }

    /**
     * Builds an empty response with just SaveInfo attached.
     */
    fun buildSaveOnlyResponse(saveInfo: SaveInfo?): FillResponse {
        val builder = FillResponse.Builder()
        if (saveInfo != null) {
            builder.setSaveInfo(saveInfo)
        }
        return builder.build()
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun buildInlinePresentation(
        spec: InlinePresentationSpec,
        cred: VaultCredential,
        titleText: String
    ): InlinePresentation? {
        return try {
            val subtitleText = cred.title.takeIf { it != titleText && it != cred.username && it.isNotEmpty() } ?: ""
            
            // Create dummy PendingIntent needed by newContentBuilder for Gboard slices
            val dummyIntent = Intent()
            val dummyPendingIntent = PendingIntent.getActivity(
                context, 
                0, 
                dummyIntent,
                PendingIntent.FLAG_IMMUTABLE
            )

            val slice = newContentBuilder(dummyPendingIntent)
                .setTitle(titleText)
                .setSubtitle(subtitleText)
                .build()
                .slice

            // spec requires minSize/maxSize configuration inside constructor
            val minSize = Size(100, spec.minSize.height)
            val maxSize = Size(spec.maxSize.width, spec.maxSize.height)
            val updatedSpec = InlinePresentationSpec.Builder(minSize, maxSize)
                .setStyle(spec.style)
                .build()

            InlinePresentation(slice, updatedSpec, false)
        } catch (e: Exception) {
            SecureLogger.e("FillResponseBuilder: Failed to construct inline suggestion Slice", e)
            null
        }
    }
}
