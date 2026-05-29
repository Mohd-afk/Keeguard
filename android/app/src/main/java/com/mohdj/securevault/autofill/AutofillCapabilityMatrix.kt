package com.mohdj.securevault.autofill

import android.os.Build

object AutofillCapabilityMatrix {
    
    fun supportsInlineSuggestions(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    }

    fun supportsCredentialManager(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
    }

    fun supportsHideOverlayWindows(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    }

    fun getRequestCodeFlags(): Int {
        return android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
    }

    /**
     * Certain Samsung devices with Android 11-12 have a bug where inline suggestions
     * crash Gboard. This check helps identify aggressive OEM keyboard configurations.
     */
    fun isSamsungQuirkDevice(): Boolean {
        return Build.MANUFACTURER.equals("samsung", ignoreCase = true) &&
               (Build.VERSION.SDK_INT == Build.VERSION_CODES.R || Build.VERSION.SDK_INT == Build.VERSION_CODES.S)
    }
}
