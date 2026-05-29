package com.mohdj.securevault.autofill

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

sealed class AutofillEvent {
    data class SaveRequestEvent(
        val action: String, // "new" or "update"
        val domain: String,
        val username: String,
        val password: String,
        val credentialId: String,
        val suggestedCategoryId: String?
    ) : AutofillEvent()
}

object AutofillEventBus {
    private val _events = MutableSharedFlow<AutofillEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<AutofillEvent> = _events.asSharedFlow()

    fun trySend(event: AutofillEvent): Boolean {
        return _events.tryEmit(event)
    }

    suspend fun send(event: AutofillEvent) {
        _events.emit(event)
    }
}
