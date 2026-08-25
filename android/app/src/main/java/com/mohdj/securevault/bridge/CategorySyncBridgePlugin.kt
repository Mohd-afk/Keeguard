// PURPOSE: Capacitor bridge plugin interfacing JS layer with native Android CategorySyncBridgePlugin.
package com.mohdj.securevault.bridge

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.mohdj.securevault.autofill.SecureLogger
import com.mohdj.securevault.autofill.security.CategorySyncSecurity

@CapacitorPlugin(name = "CategorySyncBridge")
class CategorySyncBridgePlugin : Plugin() {

    @PluginMethod
    fun syncCategories(call: PluginCall) {
        val categoriesJson = call.getObject("categories") ?: run {
            SecureLogger.e("CategorySyncBridge: Missing categories payload")
            call.reject("Missing categories")
            return
        }

        try {
            val payloadString = categoriesJson.toString()
            val hmac = CategorySyncSecurity.calculateHmac(payloadString)

            val prefs = context.getSharedPreferences("kg_live_categories", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putString("categories_payload", payloadString)
                putString("categories_hmac", hmac)
                apply()
            }

            SecureLogger.i("CategorySyncBridge: Successfully synchronized categories with HMAC validation")
            call.resolve()
        } catch (e: Exception) {
            SecureLogger.e("CategorySyncBridge: Failed to sync categories", e)
            call.reject("Category sync failure: ${e.message}")
        }
    }
}
