package com.keeguard.autofill.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * AutofillSaveReceiver
 *
 * Receives the save/update broadcast from SaveRequestHandler
 * and forwards it to the React Native layer via the EventEmitter bridge.
 *
 * Register this in AndroidManifest.xml with:
 * <receiver android:name=".autofill.bridge.AutofillSaveReceiver"
 *     android:exported="false">
 *     <intent-filter>
 *         <action android:name="com.keeguard.AUTOFILL_SAVE" />
 *     </intent-filter>
 * </receiver>
 */
class AutofillSaveReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "com.keeguard.AUTOFILL_SAVE") return

        val action = intent.getStringExtra("action") ?: return
        val domain = intent.getStringExtra("domain") ?: return

        // Forward to React Native via the KeeGuardAutofillModule event emitter
        KeeGuardAutofillModule.emitSaveEvent(
            context = context,
            action = action,
            domain = domain,
            username = intent.getStringExtra("username"),
            password = intent.getStringExtra("password") ?: intent.getStringExtra("new_password"),
            credentialId = intent.getStringExtra("credential_id"),
            suggestedCategoryId = intent.getStringExtra("suggested_category_id")
        )
    }
}
