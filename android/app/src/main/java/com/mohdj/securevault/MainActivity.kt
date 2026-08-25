// PURPOSE: Native Android Activity entry point enforcing FLAG_SECURE window screenshot protection.
package com.mohdj.securevault

import android.os.Bundle
import android.util.Log
import com.getcapacitor.BridgeActivity
import com.mohdj.securevault.bridge.VaultBridgePlugin
import com.mohdj.securevault.bridge.BiometricBridgePlugin
import com.mohdj.securevault.bridge.AutofillBridgePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Enforce FLAG_SECURE to prevent screenshots, screen recordings, and task-switcher previews of vault credentials (OWASP Mobile Security MSTG-STORAGE-9)
        window.setFlags(
            android.view.WindowManager.LayoutParams.FLAG_SECURE,
            android.view.WindowManager.LayoutParams.FLAG_SECURE
        )
        // Register plugins before calling super.onCreate()
        registerPlugin(VaultBridgePlugin::class.java)
        registerPlugin(BiometricBridgePlugin::class.java)
        registerPlugin(AutofillBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
        Log.i("MainActivity", "MainActivity created with FLAG_SECURE and plugins registered.")
    }
}

