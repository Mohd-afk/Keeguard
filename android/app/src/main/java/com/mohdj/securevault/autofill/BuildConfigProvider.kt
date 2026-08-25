// PURPOSE: Native Android Autofill service component for BuildConfigProvider.
package com.mohdj.securevault.autofill

import android.content.Context
import android.content.pm.ApplicationInfo

object BuildConfigProvider {
    const val applicationId = "com.mohdj.securevault"

    private var isDebug: Boolean? = null

    fun isDebug(context: Context): Boolean {
        if (isDebug == null) {
            isDebug = try {
                (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
            } catch (e: Exception) {
                false
            }
        }
        return isDebug ?: false
    }
}
