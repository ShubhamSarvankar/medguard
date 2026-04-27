package com.medguard.app.domain.repository

import com.medguard.app.domain.model.ActiveSession
import com.medguard.app.domain.model.User
import kotlinx.coroutines.flow.Flow

interface AuthRepository {
    val currentUser: Flow<User?>

    suspend fun registerWithPasskey(displayName: String, email: String): Result<User>

    suspend fun loginWithBiometric(): Result<User>

    suspend fun loginWithEmail(email: String, password: String, totpCode: String?): Result<User>

    suspend fun logout(): Result<Unit>

    suspend fun getActiveSessions(): Result<List<ActiveSession>>

    suspend fun revokeSession(sessionId: String): Result<Unit>
}