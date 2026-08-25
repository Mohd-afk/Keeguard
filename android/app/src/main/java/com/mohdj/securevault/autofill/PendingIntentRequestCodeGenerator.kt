// PURPOSE: Native Android Autofill service component for PendingIntentRequestCodeGenerator.
package com.mohdj.securevault.autofill

import java.util.concurrent.atomic.AtomicInteger

object PendingIntentRequestCodeGenerator {
    private val nextRequestCode = AtomicInteger(1000)
    
    fun getNext(): Int {
        return nextRequestCode.incrementAndGet()
    }
}
