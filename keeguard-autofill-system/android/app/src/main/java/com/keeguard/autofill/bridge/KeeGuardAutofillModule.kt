package com.keeguard.autofill.bridge

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * KeeGuardAutofillModule
 *
 * React Native native module that bridges the Android AutofillService
 * with the React Native JS layer.
 *
 * Exposes:
 * - Events: 'AutofillSaveRequest' (fired when user should be prompted to save/update)
 * - Methods: setVaultUnlocked, saveCredentialFromAutofill, dismissSavePrompt
 */
class KeeGuardAutofillModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "KeeGuardAutofill"

    // Called from JS when user confirms save in the bottom sheet
    @ReactMethod
    fun saveCredentialFromAutofill(
        action: String,         // "new" or "update"
        domain: String,
        username: String,
        password: String,
        categoryId: String,
        credentialId: String?,   // Only for "update"
        promise: com.facebook.react.bridge.Promise
    ) {
        // Delegate to vault data layer — same encryption pipeline as manual saves
        AutofillVaultBridge.getInstance(reactContext).apply {
            try {
                if (action == "update" && credentialId != null) {
                    updatePassword(credentialId, password)
                } else {
                    saveNew(domain, username, password, categoryId)
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("AUTOFILL_SAVE_ERROR", e.message)
            }
        }
    }

    // Called from JS when user dismisses the save prompt
    @ReactMethod
    fun dismissSavePrompt(promise: com.facebook.react.bridge.Promise) {
        promise.resolve(true)
    }

    // Called from JS to record user's category override for learning
    @ReactMethod
    fun recordCategoryOverride(domain: String, categoryId: String) {
        AutofillServiceLocator.getInstance(reactContext)
            .categorySuggester.recordUserOverride(domain, categoryId)
    }

    companion object {
        private var reactCtx: ReactApplicationContext? = null

        fun init(ctx: ReactApplicationContext) { reactCtx = ctx }

        fun emitSaveEvent(
            context: Context,
            action: String,
            domain: String,
            username: String?,
            password: String?,
            credentialId: String?,
            suggestedCategoryId: String?
        ) {
            val params = Arguments.createMap().apply {
                putString("action", action)
                putString("domain", domain)
                putString("username", username ?: "")
                putString("password", password ?: "")
                putString("credentialId", credentialId ?: "")
                putString("suggestedCategoryId", suggestedCategoryId ?: "")
            }
            reactCtx?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("AutofillSaveRequest", params)
        }
    }
}
