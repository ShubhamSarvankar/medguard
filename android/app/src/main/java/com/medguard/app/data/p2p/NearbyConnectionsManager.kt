package com.medguard.app.data.p2p

import android.content.Context
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

sealed class NearbyEvent {
    data class EndpointFound(val endpointId: String, val endpointName: String) : NearbyEvent()
    data class ConnectionEstablished(val endpointId: String) : NearbyEvent()
    data class PayloadReceived(val bytes: ByteArray) : NearbyEvent()
    data class TransferComplete(val payloadId: Long) : NearbyEvent()
    data class Disconnected(val endpointId: String) : NearbyEvent()
    data class Error(val message: String) : NearbyEvent()
}

private const val SERVICE_ID = "com.medguard.app.nearby"
private const val LOCAL_ENDPOINT_NAME = "MedGuard"

@Singleton
class NearbyConnectionsManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val _events = Channel<NearbyEvent>(Channel.BUFFERED)
    val events: Flow<NearbyEvent> = _events.receiveAsFlow()

    private val connectionsClient by lazy { Nearby.getConnectionsClient(context) }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            // Auto-accept — the NFC handshake already authenticated the peer.
            connectionsClient.acceptConnection(endpointId, payloadCallback)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.statusCode == ConnectionsStatusCodes.STATUS_OK) {
                _events.trySend(NearbyEvent.ConnectionEstablished(endpointId))
            } else {
                _events.trySend(
                    NearbyEvent.Error("Connection failed: ${result.status.statusMessage}")
                )
            }
        }

        override fun onDisconnected(endpointId: String) {
            _events.trySend(NearbyEvent.Disconnected(endpointId))
        }
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            _events.trySend(NearbyEvent.EndpointFound(endpointId, info.endpointName))
        }

        override fun onEndpointLost(endpointId: String) {
            // ShareViewModel state handles timeout; no action here.
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val bytes = payload.asBytes() ?: return
            _events.trySend(NearbyEvent.PayloadReceived(bytes))
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            if (update.status == PayloadTransferUpdate.Status.SUCCESS) {
                _events.trySend(NearbyEvent.TransferComplete(update.payloadId))
            }
        }
    }

    suspend fun startAdvertising() {
        val options = AdvertisingOptions.Builder()
            .setStrategy(Strategy.P2P_POINT_TO_POINT)
            .build()
        connectionsClient
            .startAdvertising(LOCAL_ENDPOINT_NAME, SERVICE_ID, connectionLifecycleCallback, options)
            .await()
    }

    suspend fun startDiscovery() {
        val options = DiscoveryOptions.Builder()
            .setStrategy(Strategy.P2P_POINT_TO_POINT)
            .build()
        connectionsClient
            .startDiscovery(SERVICE_ID, endpointDiscoveryCallback, options)
            .await()
    }

    suspend fun requestConnection(endpointId: String) {
        connectionsClient
            .requestConnection(LOCAL_ENDPOINT_NAME, endpointId, connectionLifecycleCallback)
            .await()
    }

    suspend fun sendPayload(endpointId: String, bytes: ByteArray) {
        val payload = Payload.fromBytes(bytes)
        connectionsClient.sendPayload(endpointId, payload).await()
    }

    fun stopAdvertising() {
        connectionsClient.stopAdvertising()
    }

    fun stopDiscovery() {
        connectionsClient.stopDiscovery()
    }

    fun disconnect(endpointId: String) {
        connectionsClient.disconnectFromEndpoint(endpointId)
    }

    fun stopAll() {
        connectionsClient.stopAllEndpoints()
    }
}