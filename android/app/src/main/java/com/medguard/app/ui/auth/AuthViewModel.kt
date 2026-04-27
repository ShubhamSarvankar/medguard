package com.medguard.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.medguard.app.domain.model.User
import com.medguard.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class AuthUiState {
    data object Idle : AuthUiState()
    data object Loading : AuthUiState()
    data class Authenticated(val user: User) : AuthUiState()
    data class Error(val message: String) : AuthUiState()
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        authRepository.currentUser
            .onEach { user ->
                if (user != null) {
                    _uiState.value = AuthUiState.Authenticated(user)
                } else if (_uiState.value is AuthUiState.Authenticated) {
                    _uiState.value = AuthUiState.Idle
                }
            }
            .launchIn(viewModelScope)
    }

    fun loginWithBiometric() {
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.loginWithBiometric()
                .onSuccess { user -> _uiState.value = AuthUiState.Authenticated(user) }
                .onFailure { error -> _uiState.value = AuthUiState.Error(error.toUiMessage()) }
        }
    }

    fun loginWithEmail(email: String, password: String, totpCode: String? = null) {
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.loginWithEmail(email, password, totpCode)
                .onSuccess { user -> _uiState.value = AuthUiState.Authenticated(user) }
                .onFailure { error -> _uiState.value = AuthUiState.Error(error.toUiMessage()) }
        }
    }

    fun registerWithPasskey(displayName: String, email: String) {
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.registerWithPasskey(displayName, email)
                .onSuccess { user -> _uiState.value = AuthUiState.Authenticated(user) }
                .onFailure { error -> _uiState.value = AuthUiState.Error(error.toUiMessage()) }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
        }
    }

    fun clearError() {
        if (_uiState.value is AuthUiState.Error) {
            _uiState.value = AuthUiState.Idle
        }
    }

    private fun Throwable.toUiMessage(): String = when {
        message?.contains("INVALID_LOGIN_CREDENTIALS") == true ->
            "Incorrect email or password."
        message?.contains("TOO_MANY_ATTEMPTS") == true ->
            "Too many attempts. Please wait and try again."
        message?.contains("NETWORK_ERROR") == true ->
            "No network connection. Please check your connection."
        message?.contains("No existing session") == true ->
            "Please sign in with your email first to enable biometric login."
        else -> "Something went wrong. Please try again."
    }
}