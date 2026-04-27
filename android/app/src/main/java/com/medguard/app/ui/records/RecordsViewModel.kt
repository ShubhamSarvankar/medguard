package com.medguard.app.ui.records

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.medguard.app.data.ConnectivityObserver
import com.medguard.app.data.NetworkStatus
import com.medguard.app.data.local.db.AttachmentEntity
import com.medguard.app.data.local.db.DiagnosisEntity
import com.medguard.app.data.local.db.MedicationEntity
import com.medguard.app.data.local.db.RecordEntity
import com.medguard.app.data.local.db.RecordWithRelations
import com.medguard.app.data.local.db.VitalsEntity
import com.medguard.app.domain.repository.AuthRepository
import com.medguard.app.domain.repository.RecordRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

sealed class RecordsUiState {
    data object Loading : RecordsUiState()
    data object Empty : RecordsUiState()
    data class Success(val records: List<RecordWithRelations>) : RecordsUiState()
    data class Error(val message: String) : RecordsUiState()
}

sealed class RecordDetailUiState {
    data object Loading : RecordDetailUiState()
    data class Success(val record: RecordWithRelations) : RecordDetailUiState()
    data object NotFound : RecordDetailUiState()
}

sealed class RecordEditUiState {
    data object Idle : RecordEditUiState()
    data object Saving : RecordEditUiState()
    data object Saved : RecordEditUiState()
    data object Deleting : RecordEditUiState()
    data object Deleted : RecordEditUiState()
    data class Error(val message: String) : RecordEditUiState()
}

data class AttachmentValidationError(val fileName: String, val reason: String)

@HiltViewModel
class RecordsViewModel @Inject constructor(
    private val recordRepository: RecordRepository,
    private val authRepository: AuthRepository,
    private val connectivityObserver: ConnectivityObserver,
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery

    private val _isOffline = MutableStateFlow(false)
    val isOffline: StateFlow<Boolean> = _isOffline

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing

    private val _detailUiState = MutableStateFlow<RecordDetailUiState>(RecordDetailUiState.Loading)
    val detailUiState: StateFlow<RecordDetailUiState> = _detailUiState

    private val _editUiState = MutableStateFlow<RecordEditUiState>(RecordEditUiState.Idle)
    val editUiState: StateFlow<RecordEditUiState> = _editUiState

    private val _attachmentErrors = MutableSharedFlow<AttachmentValidationError>()
    val attachmentErrors = _attachmentErrors.asSharedFlow()

    init {
        observeConnectivity()
    }

    private fun observeConnectivity() {
        connectivityObserver.networkStatus
            .onEach { status ->
                val wasOffline = _isOffline.value
                val isNowOffline = status == NetworkStatus.Unavailable
                _isOffline.value = isNowOffline

                if (wasOffline && !isNowOffline) {
                    syncPendingInternal()
                }
            }
            .launchIn(viewModelScope)
    }

    @OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
    val uiState: StateFlow<RecordsUiState> = combine(
        authRepository.currentUser,
        _searchQuery.debounce(300),
    ) { user, query -> user to query }
        .flatMapLatest { (user, _) ->
            if (user == null) return@flatMapLatest flowOf(RecordsUiState.Error("Not authenticated"))
            recordRepository.observeRecords(user.uid)
        }
        .combine(_searchQuery.debounce(300)) { records: List<RecordWithRelations>, query: String ->
            val filtered = if (query.isBlank()) {
                records
            } else {
                val lower = query.lowercase()
                records.filter { rwr ->
                    rwr.record.title.lowercase().contains(lower) ||
                        rwr.diagnoses.any {
                            it.description.lowercase().contains(lower) ||
                                it.code.lowercase().contains(lower)
                        } ||
                        rwr.medications.any { it.name.lowercase().contains(lower) }
                }
            }
            when {
                filtered.isEmpty() -> RecordsUiState.Empty
                else -> RecordsUiState.Success(filtered)
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = RecordsUiState.Loading,
        )

    fun onSearchQueryChanged(query: String) {
        _searchQuery.value = query
    }

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            recordRepository.syncPending()
            _isRefreshing.value = false
        }
    }

    private fun syncPendingInternal() {
        viewModelScope.launch {
            recordRepository.syncPending()
        }
    }

    fun loadRecord(recordId: String) {
        viewModelScope.launch {
            _detailUiState.value = RecordDetailUiState.Loading
            val record = recordRepository.getById(recordId)
            _detailUiState.value = if (record != null) {
                RecordDetailUiState.Success(record)
            } else {
                RecordDetailUiState.NotFound
            }
        }
    }

    fun createRecord(
        ownerUid: String,
        title: String,
        notes: String,
        visitDateMillis: Long,
        vitals: VitalsEntity?,
        medications: List<MedicationEntity>,
        diagnoses: List<DiagnosisEntity>,
        attachments: List<AttachmentEntity>,
    ) {
        viewModelScope.launch {
            _editUiState.value = RecordEditUiState.Saving
            val recordId = UUID.randomUUID().toString()
            val now = System.currentTimeMillis()
            val record = RecordWithRelations(
                record = RecordEntity(
                    recordId = recordId,
                    ownerUid = ownerUid,
                    title = title,
                    notes = notes,
                    visitDate = visitDateMillis,
                    createdAt = now,
                    updatedAt = now,
                    isSynced = false,
                ),
                vitals = vitals?.copy(recordId = recordId),
                medications = medications.map { it.copy(recordId = recordId) },
                diagnoses = diagnoses.map { it.copy(recordId = recordId) },
                attachments = attachments.map { it.copy(recordId = recordId) },
            )
            recordRepository.createRecord(record)
                .onSuccess { _editUiState.value = RecordEditUiState.Saved }
                .onFailure { _editUiState.value = RecordEditUiState.Error("Failed to save record.") }
        }
    }

    fun updateRecord(record: RecordWithRelations) {
        viewModelScope.launch {
            _editUiState.value = RecordEditUiState.Saving
            val updated = record.copy(
                record = record.record.copy(updatedAt = System.currentTimeMillis()),
            )
            recordRepository.updateRecord(updated)
                .onSuccess { _editUiState.value = RecordEditUiState.Saved }
                .onFailure { _editUiState.value = RecordEditUiState.Error("Failed to update record.") }
        }
    }

    fun deleteRecord(recordId: String) {
        viewModelScope.launch {
            _editUiState.value = RecordEditUiState.Deleting
            recordRepository.deleteRecord(recordId)
                .onSuccess { _editUiState.value = RecordEditUiState.Deleted }
                .onFailure { _editUiState.value = RecordEditUiState.Error("Failed to delete record.") }
        }
    }

    fun resetEditState() {
        _editUiState.value = RecordEditUiState.Idle
    }

    fun validateAndAddAttachment(
        fileName: String,
        mimeType: String,
        sizeBytes: Long,
        currentCount: Int,
    ): Boolean {
        val maxSizeBytes = 20L * 1024 * 1024
        val allowedTypes = setOf("application/pdf", "image/jpeg", "image/png")
        return when {
            currentCount >= 10 -> {
                viewModelScope.launch {
                    _attachmentErrors.emit(
                        AttachmentValidationError(fileName, "Maximum 10 attachments per record.")
                    )
                }
                false
            }
            sizeBytes > maxSizeBytes -> {
                viewModelScope.launch {
                    _attachmentErrors.emit(
                        AttachmentValidationError(fileName, "File exceeds 20 MB limit.")
                    )
                }
                false
            }
            mimeType !in allowedTypes -> {
                viewModelScope.launch {
                    _attachmentErrors.emit(
                        AttachmentValidationError(fileName, "Only PDF, JPEG, and PNG are supported.")
                    )
                }
                false
            }
            else -> true
        }
    }
}