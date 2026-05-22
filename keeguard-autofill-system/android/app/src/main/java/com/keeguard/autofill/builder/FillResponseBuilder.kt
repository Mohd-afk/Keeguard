package com.keeguard.autofill.builder

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.service.autofill.SaveInfo
import android.widget.RemoteViews
import com.keeguard.autofill.matcher.VaultCredential
import com.keeguard.autofill.parser.ParsedForm
import com.keeguard.autofill.parser.FormType
import com.keeguard.R

class FillResponseBuilder(private val context: Context) {

    // Called when vault is locked — shows single "Tap to unlock KeeGuard" chip
    fun buildAuthChallenge(parsedForm: ParsedForm): FillResponse {
        val unlockIntent = context.packageManager
            .getLaunchIntentForPackage(context.packageName)!!
            .apply { putExtra("autofill_unlock", true) }

        val pendingIntent = PendingIntent.getActivity(
            context, 0, unlockIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val presentation = buildPresentation("Tap to unlock KeeGuard", null)

        return FillResponse.Builder()
            .setAuthentication(parsedForm.allAutofillIds, pendingIntent.intentSender, presentation)
            .build()
    }

    // Called when vault is unlocked — builds datasets for matched credentials
    fun buildFillResponse(
        parsedForm: ParsedForm,
        matches: List<VaultCredential>,
        saveInfo: SaveInfo?
    ): FillResponse {
        val builder = FillResponse.Builder()

        for (credential in matches.take(5)) {  // Cap at 5 suggestions max
            val dataset = buildDataset(parsedForm, credential) ?: continue
            builder.addDataset(dataset)
        }

        // If no matches: add a "Save to KeeGuard" discovery hint
        if (matches.isEmpty()) {
            val hintPresentation = buildPresentation("Save login to KeeGuard", null)
            val emptyDataset = Dataset.Builder(hintPresentation)
                .apply {
                    parsedForm.usernameField?.let { setValue(it.autofillId, null) }
                    parsedForm.passwordField?.let { setValue(it.autofillId, null) }
                }
                .build()
            builder.addDataset(emptyDataset)
        }

        saveInfo?.let { builder.setSaveInfo(it) }
        return builder.build()
    }

    private fun buildDataset(parsedForm: ParsedForm, credential: VaultCredential): Dataset? {
        val presentation = buildPresentation(credential.username, credential.faviconUrl)
        return Dataset.Builder(presentation)
            .apply {
                parsedForm.usernameField?.let {
                    setValue(it.autofillId, android.view.autofill.AutofillValue.forText(credential.username))
                }
                parsedForm.passwordField?.let {
                    setValue(it.autofillId, android.view.autofill.AutofillValue.forText(credential.password))
                }
            }
            .build()
    }

    private fun buildPresentation(label: String, faviconUrl: String?): RemoteViews {
        return RemoteViews(context.packageName, R.layout.autofill_suggestion_item).apply {
            setTextViewText(R.id.autofill_text, label)
            // Favicon loading handled in the RemoteViews update after inflation
        }
    }
}
