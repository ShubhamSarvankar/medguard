package com.medguard.app.data

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionManager @Inject constructor() : DefaultLifecycleObserver {

    companion object {
        const val IDLE_TIMEOUT_MS = 15 * 60 * 1000L // FR-AUTH-04: 15-minute idle timeout
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val _sessionExpired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val sessionExpired: SharedFlow<Unit> = _sessionExpired.asSharedFlow()

    private var idleJob: Job? = null
    private var isForegrounded = false

    init {
        try {
            ProcessLifecycleOwner.get().lifecycle.addObserver(this)
        } catch (_: Exception) {
            // Not running in an Android process (e.g. JVM unit tests).
            // Treat as always-foregrounded and start the timer directly.
            isForegrounded = true
            restartIdleTimer()
        }
    }

    override fun onStart(owner: LifecycleOwner) {
        isForegrounded = true
        restartIdleTimer()
    }

    override fun onStop(owner: LifecycleOwner) {
        isForegrounded = false
        // Idle time only counts while the app is visible; cancel timer in background.
        idleJob?.cancel()
    }

    fun recordActivity() {
        if (isForegrounded) restartIdleTimer()
    }

    fun cancelTimer() {
        idleJob?.cancel()
    }

    private fun restartIdleTimer() {
        idleJob?.cancel()
        idleJob = scope.launch {
            delay(IDLE_TIMEOUT_MS)
            _sessionExpired.tryEmit(Unit)
        }
    }
}