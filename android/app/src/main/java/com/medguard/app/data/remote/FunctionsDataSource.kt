package com.medguard.app.data.remote

import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FunctionsDataSource @Inject constructor(
    private val functions: FirebaseFunctions,
) {

    suspend fun inviteToCareCircle(inviteeEmail: String, role: String): Result<String> =
        runCatching {
            val data = mapOf("inviteeEmail" to inviteeEmail, "role" to role)
            val result = functions.getHttpsCallable("inviteToCareCircle").call(data).await()
            @Suppress("UNCHECKED_CAST")
            (result.data as Map<String, Any>)["inviteId"] as String
        }

    suspend fun acceptCareCircleInvite(inviteId: String): Result<Unit> = runCatching {
        val data = mapOf("inviteId" to inviteId)
        functions.getHttpsCallable("acceptCareCircleInvite").call(data).await()
    }

    suspend fun removeCareCircleMember(memberUid: String): Result<Unit> = runCatching {
        val data = mapOf("memberUid" to memberUid)
        functions.getHttpsCallable("removeCareCircleMember").call(data).await()
    }

    suspend fun deleteUserData(uid: String, confirmPhrase: String): Result<String> = runCatching {
        val data = mapOf("uid" to uid, "confirmPhrase" to confirmPhrase)
        val result = functions.getHttpsCallable("deleteUserData").call(data).await()
        @Suppress("UNCHECKED_CAST")
        (result.data as Map<String, Any>)["scheduledFor"] as String
    }
}
