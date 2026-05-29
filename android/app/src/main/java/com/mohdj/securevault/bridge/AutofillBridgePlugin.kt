package com.mohdj.securevault.bridge

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.mohdj.securevault.autofill.AutofillEvent
import com.mohdj.securevault.autofill.AutofillEventBus
import com.mohdj.securevault.autofill.AutofillServiceLocator
import com.mohdj.securevault.autofill.AutofillVaultRepositoryAdapter
import com.mohdj.securevault.autofill.DomainMatcher
import com.mohdj.securevault.autofill.SecureLogger
import com.mohdj.securevault.autofill.matcher.VaultCredential
import com.mohdj.securevault.vault.VaultRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "AutofillBridge")
class AutofillBridgePlugin : Plugin() {

    private lateinit var adapter: AutofillVaultRepositoryAdapter
    private val pluginScope = CoroutineScope(Dispatchers.Main + Job())

    override fun load() {
        super.load()
        val dbRepo = VaultRepository(context)
        val domainMatcher = DomainMatcher(context)
        adapter = AutofillVaultRepositoryAdapter(dbRepo, domainMatcher)

        // Subscribe to process-internal AutofillEventBus instead of LocalBroadcastManager
        pluginScope.launch {
            AutofillEventBus.events.collect { event ->
                if (event is AutofillEvent.SaveRequestEvent) {
                    SecureLogger.i("AutofillBridgePlugin: Forwarding save request event to Capacitor layer")
                    val data = JSObject().apply {
                        put("action", event.action)
                        put("domain", event.domain)
                        put("username", event.username)
                        put("password", event.password)
                        put("credentialId", event.credentialId)
                        put("suggestedCategoryId", event.suggestedCategoryId ?: "")
                    }
                    notifyListeners("autofillSaveRequest", data)
                }
            }
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
                    SecureLogger.i("AutofillBridgePlugin: Successfully updated credential password in native DB")
                } else {
                    val isApp = !domain.contains(".") && !domain.startsWith("http")
                    val cred = VaultCredential(
                        id = credentialId.ifBlank { "" },
                        title = domain,
                        username = username,
                        password = password,
                        uris = if (!isApp) listOf(domain) else emptyList(),
                        packageName = if (isApp) domain else null,
                        categoryId = categoryId,
                        lastUsedAt = System.currentTimeMillis(),
                        faviconUrl = null
                    )
                    adapter.saveCredential(cred)
                    SecureLogger.i("AutofillBridgePlugin: Successfully saved new credential in native DB")
                }
                call.resolve()
            } catch (e: Exception) {
                SecureLogger.e("AutofillBridgePlugin: Failed to save/update credential", e)
                call.reject("Failed to save credential: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun dismissSavePrompt(call: PluginCall) {
        SecureLogger.i("AutofillBridgePlugin: User dismissed save prompt sheet")
        call.resolve()
    }

    @PluginMethod
    fun recordCategoryOverride(call: PluginCall) {
        val domain = call.getString("domain") ?: return call.reject("Missing domain")
        val categoryId = call.getString("categoryId") ?: return call.reject("Missing categoryId")
        try {
            AutofillServiceLocator.getInstance(context).categorySuggester.recordUserOverride(domain, categoryId)
            SecureLogger.i("AutofillBridgePlugin: Successfully recorded category override for domain=$domain")
            call.resolve()
        } catch (e: Exception) {
            SecureLogger.e("AutofillBridgePlugin: Failed to record category override", e)
            call.reject("Failed to record category override: ${e.message}")
        }
    }

    override fun handleOnDestroy() {
        pluginScope.cancel()
        super.handleOnDestroy()
    }
}
