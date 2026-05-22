package com.mohdj.securevault.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.mohdj.securevault.autofill.AutofillVaultRepositoryAdapter
import com.mohdj.securevault.autofill.matcher.VaultCredential
import com.mohdj.securevault.vault.VaultRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "AutofillBridge")
class AutofillBridgePlugin : Plugin() {

    private lateinit var adapter: AutofillVaultRepositoryAdapter
    private var isReceiverRegistered = false

    private val saveReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            Log.i("AutofillBridgePlugin", "Received com.mohdj.securevault.AUTOFILL_SAVE broadcast")
            val action = intent.getStringExtra("action") ?: "new"
            val domain = intent.getStringExtra("domain") ?: ""
            val username = intent.getStringExtra("username") ?: ""
            val password = intent.getStringExtra("password") ?: intent.getStringExtra("new_password") ?: ""
            val credentialId = intent.getStringExtra("credential_id") ?: ""
            val suggestedCategoryId = intent.getStringExtra("suggested_category_id") ?: ""

            val data = JSObject().apply {
                put("action", action)
                put("domain", domain)
                put("username", username)
                put("password", password)
                put("credentialId", credentialId)
                put("suggestedCategoryId", suggestedCategoryId)
            }
            notifyListeners("autofillSaveRequest", data)
        }
    }

    override fun load() {
        super.load()
        val dbRepo = VaultRepository(context)
        adapter = AutofillVaultRepositoryAdapter(dbRepo)

        try {
            val filter = IntentFilter("com.mohdj.securevault.AUTOFILL_SAVE")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(saveReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(saveReceiver, filter)
            }
            isReceiverRegistered = true
            Log.i("AutofillBridgePlugin", "Registered com.mohdj.securevault.AUTOFILL_SAVE receiver")
        } catch (e: Exception) {
            Log.e("AutofillBridgePlugin", "Failed to register broadcast receiver", e)
        }
    }

    @PluginMethod
    fun saveCredentialFromAutofill(call: PluginCall) {
        val action = call.getString("action") ?: "new"
        val domain = call.getString("domain") ?: ""
        val username = call.getString("username") ?: ""
        val password = call.getString("password") ?: ""
        val credentialId = call.getString("credentialId") ?: ""
        val categoryId = call.getString("categoryId") ?: ""

        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (action == "update") {
                    if (credentialId.isBlank()) {
                        call.reject("Must provide credentialId for update action")
                        return@launch
                    }
                    adapter.updateCredentialPassword(credentialId, password)
                    Log.i("AutofillBridgePlugin", "Successfully updated credential $credentialId in native DB")
                } else {
                    val isApp = !domain.contains(".") && !domain.startsWith("http")
                    val cred = VaultCredential(
                        id = credentialId.ifBlank { "" },
                        title = domain,
                        username = username,
                        password = password,
                        uri = if (!isApp) domain else null,
                        packageName = if (isApp) domain else null,
                        categoryId = categoryId,
                        lastUsedAt = System.currentTimeMillis(),
                        faviconUrl = null
                    )
                    adapter.saveCredential(cred)
                    Log.i("AutofillBridgePlugin", "Successfully saved new credential for $domain in native DB")
                }
                call.resolve()
            } catch (e: Exception) {
                Log.e("AutofillBridgePlugin", "Failed to save/update credential", e)
                call.reject("Failed to save credential: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun dismissSavePrompt(call: PluginCall) {
        // Safe to no-op, user closed the sheet
        Log.i("AutofillBridgePlugin", "User dismissed save prompt sheet")
        call.resolve()
    }

    override fun handleOnDestroy() {
        if (isReceiverRegistered) {
            try {
                context.unregisterReceiver(saveReceiver)
                isReceiverRegistered = false
                Log.i("AutofillBridgePlugin", "Unregistered receiver")
            } catch (e: Exception) {
                Log.e("AutofillBridgePlugin", "Error unregistering receiver", e)
            }
        }
        super.handleOnDestroy()
    }
}
