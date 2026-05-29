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
            presentation.setTextViewText(
                R.id.text1,
                cred.username.ifEmpty { cred.title }.ifEmpty { "Keeguard" }
            )

            // Attempt to build inline presentation if specs are provided and allowed
            var inlinePresentation: InlinePresentation? = null
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && inlineSpecs != null && inlineSpecs.isNotEmpty() && isInlineAllowed) {
                val inlineSpec = inlineSpecs[0]
                inlinePresentation = buildInlinePresentation(inlineSpec, cred)
            }

            var datasetUsable = false

            parsedForm.usernameField?.autofillId?.let { id ->
                if (inlinePresentation != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.username), presentation, inlinePresentation)
                } else {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.username), presentation)
                }
                datasetUsable = true
            }

            parsedForm.emailField?.autofillId?.let { id ->
                if (inlinePresentation != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.username), presentation, inlinePresentation)
                } else {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.username), presentation)
                }
                datasetUsable = true
            }

            parsedForm.passwordField?.autofillId?.let { id ->
                if (inlinePresentation != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.password), presentation, inlinePresentation)
                } else {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.password), presentation)
                }
                datasetUsable = true
            }

            parsedForm.newPasswordField?.autofillId?.let { id ->
                if (inlinePresentation != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.password), presentation, inlinePresentation)
                } else {
                    datasetBuilder.setValue(id, AutofillValue.forText(cred.password), presentation)
                }
                datasetUsable = true
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
        cred: VaultCredential
    ): InlinePresentation? {
        return try {
            val titleText = cred.username.ifEmpty { cred.title }.ifEmpty { "Keeguard" }
            val subtitleText = cred.title.takeIf { it != cred.username && it.isNotEmpty() } ?: ""
            
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
