package com.medguard.app.ui.share

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import com.medguard.app.data.local.db.RecordEntity
import com.medguard.app.data.local.db.RecordWithRelations
import com.medguard.app.data.p2p.EcdhKeyExchange
import com.medguard.app.data.p2p.NearbyConnectionsManager
import com.medguard.app.data.p2p.NearbyEvent
import com.medguard.app.data.p2p.NfcHandshakeEvent
import com.medguard.app.data.p2p.NfcHandshakeManager
import com.medguard.app.domain.repository.RecordRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.security.KeyPair
import java.security.PublicKey
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject

sealed class ShareUiState {
    data object Idle : ShareUiState()
    data object WaitingForTap : ShareUiState()
    data object Connecting : ShareUiState()
    data object Transferring : ShareUiState()
    data class CodeReady(val code: String, val expiresAt: String?) : ShareUiState()
    data object Accepted : ShareUiState()
    data class Error(val message: String) : ShareUiState()
}

sealed class ShareMode {
    data object Sender : ShareMode()
    data object Recipient : ShareMode()
}

private const val AES_GCM_TAG_LENGTH = 128

@HiltViewModel
class ShareViewModel @Inject constructor(
    private val recordRepository: RecordRepository,
    private val nfcHandshakeManager: NfcHandshakeManager,
    private val nearbyConnectionsManager: NearbyConnectionsManager,
    private val ecdhKeyExchange: EcdhKeyExchange,
    private val functions: FirebaseFunctions,
) : ViewModel() {

    private val _uiState = MutableStateFlow<ShareUiState>(ShareUiState.Idle)
    val uiState: StateFlow<ShareUiState> = _uiState

    private var localKeyPair: KeyPair? = null
    private var sessionKey: SecretKey? = null
    private var activeEndpointId: String? = null
    private var pendingRecordId: String? = null

    init {
        observeNfcEvents()
        observeNearbyEvents()
    }

    fun initiateTapShare(recordId: String, localPublicKeyBytes: ByteArray) {
        pendingRecordId = recordId
        _uiState.value = ShareUiState.WaitingForTap

        viewModelScope.launch {
            runCatching { nearbyConnectionsManager.startAdvertising() }
                .onFailure { _uiState.value = ShareUiState.Error("Failed to start advertising.") }
        }
    }

    fun initiateCodeShare(recordId: String, expiry: String) {
        pendingRecordId = recordId
        viewModelScope.launch {
            val result = runCatching {
                val callable = functions.getHttpsCallable("initiateShare")
                val response = callable.call(
                    mapOf("recordId" to recordId, "method" to "code", "expiry" to expiry)
                ).await()
                @Suppress("UNCHECKED_CAST")
                response.data as Map<String, Any?>
            }
            result
                .onSuccess { data ->
                    _uiState.value = ShareUiState.CodeReady(
                        code = data["code"] as? String ?: "",
                        expiresAt = data["expiresAt"] as? String,
                    )
                }
                .onFailure { _uiState.value = ShareUiState.Error("Failed to generate share code.") }
        }
    }

    fun acceptByCode(code: String) {
        viewModelScope.launch {
            _uiState.value = ShareUiState.Connecting
            val result = runCatching {
                val callable = functions.getHttpsCallable("acceptShare")
                val response = callable.call(mapOf("code" to code)).await()
                @Suppress("UNCHECKED_CAST")
                response.data as Map<String, Any?>
            }
            result
                .onSuccess { data -> handleAcceptResponse(data, code) }
                .onFailure { e ->
                    _uiState.value = ShareUiState.Error(
                        friendlyAcceptError(e.message ?: "Unknown error")
                    )
                }
        }
    }

    private fun acceptTapShare(shareId: String, sessionKeyHex: String) {
        viewModelScope.launch {
            val result = runCatching {
                val callable = functions.getHttpsCallable("acceptShare")
                val response = callable.call(
                    mapOf("shareId" to shareId, "sessionKeyHex" to sessionKeyHex)
                ).await()
                @Suppress("UNCHECKED_CAST")
                response.data as Map<String, Any?>
            }
            result
                .onSuccess { data -> handleAcceptResponse(data, null) }
                .onFailure { _uiState.value = ShareUiState.Error("Failed to accept tap share.") }
        }
    }

    private fun observeNfcEvents() {
        nfcHandshakeManager.events
            .onEach { event ->
                when (event) {
                    is NfcHandshakeEvent.PeerPublicKeyReceived -> onPeerKeyReceived(event.publicKey)
                    is NfcHandshakeEvent.HandshakeError ->
                        _uiState.value = ShareUiState.Error(event.message)
                }
            }
            .launchIn(viewModelScope)
    }

    private fun onPeerKeyReceived(peerPublicKey: PublicKey) {
        val keyPair = localKeyPair ?: run {
            _uiState.value = ShareUiState.Error("Local key pair not initialised.")
            return
        }
        sessionKey = ecdhKeyExchange.deriveSessionKey(keyPair, peerPublicKey)
        _uiState.value = ShareUiState.Connecting
    }

    private fun observeNearbyEvents() {
        nearbyConnectionsManager.events
            .onEach { event ->
                when (event) {
                    is NearbyEvent.EndpointFound -> {
                        runCatching {
                            nearbyConnectionsManager.requestConnection(event.endpointId)
                        }
                    }
                    is NearbyEvent.ConnectionEstablished -> {
                        activeEndpointId = event.endpointId
                        onConnectionEstablished(event.endpointId)
                    }
                    is NearbyEvent.PayloadReceived -> onPayloadReceived(event.bytes)
                    is NearbyEvent.TransferComplete -> _uiState.value = ShareUiState.Accepted
                    is NearbyEvent.Disconnected -> cleanup()
                    is NearbyEvent.Error ->
                        _uiState.value = ShareUiState.Error(event.message)
                }
            }
            .launchIn(viewModelScope)
    }

    private fun onConnectionEstablished(endpointId: String) {
        val recordId = pendingRecordId ?: return
        val key = sessionKey ?: return

        viewModelScope.launch {
            _uiState.value = ShareUiState.Transferring
            val record = recordRepository.getById(recordId) ?: run {
                _uiState.value = ShareUiState.Error("Record not found.")
                return@launch
            }
            val plaintext = record.record.title.toByteArray()
            val encrypted = aesGcmEncrypt(plaintext, key)
            runCatching { nearbyConnectionsManager.sendPayload(endpointId, encrypted) }
                .onFailure { _uiState.value = ShareUiState.Error("Transfer failed.") }
        }
    }

    private fun onPayloadReceived(bytes: ByteArray) {
        val key = sessionKey ?: run {
            _uiState.value = ShareUiState.Error("No session key — handshake incomplete.")
            return
        }
        viewModelScope.launch {
            runCatching {
                val plaintext = aesGcmDecrypt(bytes, key)
                val title = String(plaintext)
                val entity = RecordEntity(
                    recordId = "shared-${System.currentTimeMillis()}",
                    ownerUid = "",
                    title = title,
                    notes = "",
                    visitDate = 0L,
                    createdAt = System.currentTimeMillis(),
                    updatedAt = System.currentTimeMillis(),
                    isSynced = true,
                )
                val record = RecordWithRelations(
                    record = entity,
                    vitals = null,
                    medications = emptyList(),
                    diagnoses = emptyList(),
                    attachments = emptyList(),
                )
                recordRepository.saveSharedRecord(record)
            }
                .onSuccess { _uiState.value = ShareUiState.Accepted }
                .onFailure { _uiState.value = ShareUiState.Error("Failed to save received record.") }
        }
    }

    private suspend fun handleAcceptResponse(data: Map<String, Any?>, code: String?) {
        val encryptedPayload = data["encryptedPayload"] as? String ?: run {
            _uiState.value = ShareUiState.Error("Missing payload in response.")
            return
        }
        val recordId = data["recordId"] as? String ?: run {
            _uiState.value = ShareUiState.Error("Missing recordId in response.")
            return
        }

        // TODO production: decrypt encryptedPayload with session key to recover the per-record data key.
        // Emulator records are stored as plaintext de-identified documents, so data key is not applied.
        if (code != null) {
            runCatching {
                val keyBytes = hkdfFromCode(code, data["shareId"] as? String ?: "")
                val payloadBytes = android.util.Base64.decode(encryptedPayload, android.util.Base64.DEFAULT)
                aesGcmDecryptRaw(payloadBytes, javax.crypto.spec.SecretKeySpec(keyBytes, "AES"))
            }
        }

        val entity = RecordEntity(
            recordId = recordId,
            ownerUid = data["senderUid"] as? String ?: "",
            title = "Shared Record",
            notes = "",
            visitDate = 0L,
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis(),
            isSynced = true,
        )
        val record = RecordWithRelations(
            record = entity,
            vitals = null,
            medications = emptyList(),
            diagnoses = emptyList(),
            attachments = emptyList(),
        )
        recordRepository.saveSharedRecord(record)
            .onSuccess { _uiState.value = ShareUiState.Accepted }
            .onFailure { _uiState.value = ShareUiState.Error("Failed to save shared record.") }
    }

    private fun aesGcmEncrypt(plaintext: ByteArray, key: SecretKey): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext)
        return iv + ciphertext
    }

    private fun aesGcmDecrypt(data: ByteArray, key: SecretKey): ByteArray {
        val iv = data.copyOfRange(0, 12)
        val ciphertext = data.copyOfRange(12, data.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(AES_GCM_TAG_LENGTH, iv))
        return cipher.doFinal(ciphertext)
    }

    private fun aesGcmDecryptRaw(data: ByteArray, key: SecretKey): ByteArray {
        val iv = data.copyOfRange(0, 12)
        val ciphertext = data.copyOfRange(12, data.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(AES_GCM_TAG_LENGTH, iv))
        return cipher.doFinal(ciphertext)
    }

    private fun hkdfFromCode(code: String, shareId: String): ByteArray {
        val mac = javax.crypto.Mac.getInstance("HmacSHA256")
        mac.init(javax.crypto.spec.SecretKeySpec(shareId.toByteArray(), "HmacSHA256"))
        val prk = mac.doFinal(code.toByteArray())
        mac.init(javax.crypto.spec.SecretKeySpec(prk, "HmacSHA256"))
        mac.update("medguard-code-share".toByteArray())
        mac.update(1.toByte())
        return mac.doFinal().copyOfRange(0, 32)
    }

    private fun cleanup() {
        nearbyConnectionsManager.stopAll()
        activeEndpointId = null
        sessionKey = null
        localKeyPair = null
        pendingRecordId = null
    }

    fun reset() {
        cleanup()
        _uiState.value = ShareUiState.Idle
    }

    override fun onCleared() {
        super.onCleared()
        cleanup()
    }

    private fun friendlyAcceptError(raw: String): String = when {
        "resource-exhausted" in raw -> "This code has already been used."
        "deadline-exceeded" in raw -> "This code has expired."
        "not-found" in raw -> "Code not found. Check and try again."
        "failed-precondition" in raw -> "This share is no longer active."
        "permission-denied" in raw -> "You are not the intended recipient."
        else -> "Failed to accept share. Please try again."
    }
}