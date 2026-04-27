package com.medguard.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.medguard.app.data.SessionManager
import com.medguard.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SessionViewModel @Inject constructor(
    private val sessionManager: SessionManager,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _navigateToAuth = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val navigateToAuth: SharedFlow<Unit> = _navigateToAuth.asSharedFlow()

    init {
        sessionManager.sessionExpired
            .onEach { expireSession() }
            .launchIn(viewModelScope)
    }

    fun recordActivity() = sessionManager.recordActivity()

    private fun expireSession() {
        viewModelScope.launch {
            authRepository.logout()
            _navigateToAuth.tryEmit(Unit)
        }
    }
}