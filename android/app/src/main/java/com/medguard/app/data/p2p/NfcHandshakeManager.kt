package com.medguard.app.data.p2p

import android.app.Activity
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import java.security.KeyPair
import java.security.PublicKey
import javax.inject.Inject
import javax.inject.Singleton

sealed class NfcHandshakeEvent {
    data class PeerPublicKeyReceived(val publicKey: PublicKey) : NfcHandshakeEvent()
    data class HandshakeError(val message: String) : NfcHandshakeEvent()
}

private const val NFC_MIME_TYPE = "application/com.medguard.handshake"

// Uses foreground dispatch (Android Beam/NDEF P2P is deprecated): each device writes its ECDH
// public key to an NDEF tag and reads the peer's on contact. On emulator, inject via simulateTagReceived().
@Singleton
class NfcHandshakeManager @Inject constructor(
    private val ecdhKeyExchange: EcdhKeyExchange,
) {

    private val _events = Channel<NfcHandshakeEvent>(Channel.BUFFERED)
    val events: Flow<NfcHandshakeEvent> = _events.receiveAsFlow()

    private var localKeyPair: KeyPair? = null
    private var nfcAdapter: NfcAdapter? = null

    fun prepare(activity: Activity): ByteArray {
        nfcAdapter = NfcAdapter.getDefaultAdapter(activity)
        localKeyPair = ecdhKeyExchange.generateKeyPair()
        return ecdhKeyExchange.encodePublicKey(localKeyPair!!)
    }

    // Must be called from Activity.onResume(); gives this activity priority over tag intents.
    fun enableForegroundDispatch(activity: Activity) {
        val adapter = nfcAdapter ?: return
        val intent = android.content.Intent(activity, activity::class.java).apply {
            addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pendingIntent = android.app.PendingIntent.getActivity(
            activity, 0, intent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE,
        )
        val filters = arrayOf(
            android.content.IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply {
                addDataType(NFC_MIME_TYPE)
            }
        )
        adapter.enableForegroundDispatch(activity, pendingIntent, filters, null)
    }

    // Must be called from Activity.onPause().
    fun disableForegroundDispatch(activity: Activity) {
        nfcAdapter?.disableForegroundDispatch(activity)
    }

    fun onNfcIntent(intent: android.content.Intent) {
        val rawMessages = intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)
            ?: run {
                emitError("No NDEF messages in NFC intent.")
                return
            }

        val message = rawMessages.firstOrNull() as? NdefMessage
            ?: run {
                emitError("Could not parse NDEF message.")
                return
            }

        val payload = message.records.firstOrNull()?.payload
            ?: run {
                emitError("Empty NDEF payload.")
                return
            }

        handlePeerPublicKeyBytes(payload)
    }

    fun onTagDiscovered(tag: Tag) {
        val ndef = Ndef.get(tag) ?: run {
            emitError("Tag does not support NDEF.")
            return
        }
        try {
            ndef.connect()
            val message = ndef.ndefMessage ?: run {
                emitError("Tag has no NDEF message.")
                return
            }
            val payload = message.records.firstOrNull()?.payload ?: run {
                emitError("Empty NDEF record.")
                return
            }
            handlePeerPublicKeyBytes(payload)
        } catch (e: Exception) {
            emitError("Failed to read NFC tag: ${e.message}")
        } finally {
            runCatching { ndef.close() }
        }
    }

    fun buildNdefMessage(localPublicKeyBytes: ByteArray): NdefMessage {
        val record = NdefRecord.createMime(NFC_MIME_TYPE, localPublicKeyBytes)
        return NdefMessage(arrayOf(record))
    }

    // Test/emulator hook — bypasses physical NFC hardware.
    fun simulateTagReceived(peerPublicKeyBytes: ByteArray) {
        handlePeerPublicKeyBytes(peerPublicKeyBytes)
    }

    fun getLocalKeyPair(): KeyPair? = localKeyPair

    fun reset() {
        localKeyPair = null
    }

    private fun handlePeerPublicKeyBytes(bytes: ByteArray) {
        try {
            val peerPublicKey = ecdhKeyExchange.decodePublicKey(bytes)
            _events.trySend(NfcHandshakeEvent.PeerPublicKeyReceived(peerPublicKey))
        } catch (e: Exception) {
            emitError("Failed to decode peer public key: ${e.message}")
        }
    }

    private fun emitError(message: String) {
        _events.trySend(NfcHandshakeEvent.HandshakeError(message))
    }
}