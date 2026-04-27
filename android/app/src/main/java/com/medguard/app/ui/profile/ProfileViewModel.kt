package com.medguard.app.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.medguard.app.data.remote.FirestoreDataSource
import com.medguard.app.data.remote.FunctionsDataSource
import com.medguard.app.domain.model.AuditEntry
import com.medguard.app.domain.model.CareCircleMember
import com.medguard.app.domain.model.User
import com.medguard.app.domain.model.UserRole
import com.medguard.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileState(
    val profile: User? = null,
    val careCircle: List<CareCircleMember> = emptyList(),
    val recentActivity: List<AuditEntry> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

sealed class ProfileAction {
    data object Idle : ProfileAction()
    data object Pending : ProfileAction()
    data class Success(val message: String) : ProfileAction()
    data class Error(val message: String) : ProfileAction()
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val firestoreDataSource: FirestoreDataSource,
    private val functionsDataSource: FunctionsDataSource,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileState())
    val state: StateFlow<ProfileState> = _state

    private val _action = MutableStateFlow<ProfileAction>(ProfileAction.Idle)
    val action: StateFlow<ProfileAction> = _action

    init {
        load()
    }

    fun refresh() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        load()
    }

    private fun load() {
        viewModelScope.launch {
            val user = authRepository.currentUser.first()
            if (user == null) {
                _state.value = ProfileState(isLoading = false, error = "Not authenticated.")
                return@launch
            }
            val uid = user.uid

            val profileResult = firestoreDataSource.fetchUserProfile(uid)
            val profile = profileResult.getOrNull()

            val careCircle = if (profile?.role == UserRole.PATIENT) {
                firestoreDataSource.fetchCareCircle(uid).getOrElse { emptyList() }
            } else {
                emptyList()
            }

            val recentActivity = firestoreDataSource.fetchAuditLog(uid, limit = 20)
                .getOrElse { emptyList() }

            _state.value = ProfileState(
                profile = profile,
                careCircle = careCircle,
                recentActivity = recentActivity,
                isLoading = false,
                error = if (profileResult.isFailure) "Failed to load profile." else null,
            )
        }
    }

    fun inviteToCareCircle(inviteeEmail: String, role: String) {
        _action.value = ProfileAction.Pending
        viewModelScope.launch {
            functionsDataSource.inviteToCareCircle(inviteeEmail, role)
                .onSuccess {
                    _action.value = ProfileAction.Success("Invite sent.")
                    refresh()
                }
                .onFailure {
                    _action.value = ProfileAction.Error(it.message ?: "Failed to send invite.")
                }
        }
    }

    fun removeCareCircleMember(memberUid: String) {
        _action.value = ProfileAction.Pending
        viewModelScope.launch {
            functionsDataSource.removeCareCircleMember(memberUid)
                .onSuccess {
                    _action.value = ProfileAction.Success("Member removed.")
                    refresh()
                }
                .onFailure {
                    _action.value = ProfileAction.Error(it.message ?: "Failed to remove member.")
                }
        }
    }

    fun deleteUserData(confirmPhrase: String) {
        _action.value = ProfileAction.Pending
        viewModelScope.launch {
            val user = authRepository.currentUser.first() ?: run {
                _action.value = ProfileAction.Error("Not authenticated.")
                return@launch
            }
            functionsDataSource.deleteUserData(user.uid, confirmPhrase)
                .onSuccess { scheduledFor ->
                    _action.value = ProfileAction.Success("Deletion scheduled for $scheduledFor.")
                }
                .onFailure {
                    _action.value = ProfileAction.Error(it.message ?: "Failed to request deletion.")
                }
        }
    }

    fun clearAction() {
        _action.value = ProfileAction.Idle
    }
}