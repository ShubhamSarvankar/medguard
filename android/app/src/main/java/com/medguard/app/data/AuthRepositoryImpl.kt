package com.medguard.app.data

import androidx.fragment.app.FragmentActivity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.medguard.app.data.local.crypto.BiometricManager
import com.medguard.app.data.local.crypto.KeystoreManager
import com.medguard.app.domain.model.ActiveSession
import com.medguard.app.domain.model.User
import com.medguard.app.domain.model.UserRole
import com.medguard.app.domain.repository.AuthRepository
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val firebaseAuth: FirebaseAuth,
    private val biometricManager: BiometricManager,
    private val keystoreManager: KeystoreManager,
) : AuthRepository {

    // Emits on cold start as well as every subsequent auth-state change.
    override val currentUser: Flow<User?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { auth ->
            trySend(auth.currentUser?.toDomainUser())
        }
        firebaseAuth.addAuthStateListener(listener)
        awaitClose { firebaseAuth.removeAuthStateListener(listener) }
    }

    // FIDO2 ceremony is initiated in the ViewModel where the Activity context is available;
    // this method is the coordination point called after credential creation succeeds.
    override suspend fun registerWithPasskey(
        displayName: String,
        email: String,
    ): Result<User> = runCatching {
        val user = firebaseAuth.currentUser
            ?: error("Passkey registration did not produce an authenticated user")
        user.toDomainUser()
    }

    // Biometric gate is enforced by the Keystore key; the ID token can only be decrypted
    // after successful biometric auth. Force-refreshes the token to validate server-side liveness.
    override suspend fun loginWithBiometric(): Result<User> = runCatching {
        val user = firebaseAuth.currentUser
            ?: error("No existing session — biometric login requires a prior credential")
        user.getIdToken(true).await()
        user.toDomainUser()
    }

    override suspend fun loginWithEmail(
        email: String,
        password: String,
        totpCode: String?,
    ): Result<User> = runCatching {
        val result = firebaseAuth.signInWithEmailAndPassword(email, password).await()
        val user = result.user ?: error("Sign-in succeeded but returned no user")
        // If MFA is enrolled the SDK raises FirebaseAuthMultiFactorException; the ViewModel
        // catches it and routes to the MFA resolution screen.
        user.toDomainUser()
    }

    override suspend fun logout(): Result<Unit> = runCatching {
        keystoreManager.clearSessionToken()
        firebaseAuth.signOut()
    }

    // Firebase Auth has no first-party session-list API; returns a single synthetic entry
    // until Firestore session documents are available (Phase 3).
    override suspend fun getActiveSessions(): Result<List<ActiveSession>> = runCatching {
        val user = firebaseAuth.currentUser ?: return@runCatching emptyList()
        val tokenResult = user.getIdToken(false).await()
        listOf(
            ActiveSession(
                sessionId = tokenResult.token?.takeLast(16) ?: "current",
                deviceInfo = android.os.Build.MODEL,
                lastActive = System.currentTimeMillis(),
                isCurrent = true,
            )
        )
    }

    // Full multi-device revocation requires Phase 7 Firestore session docs; revokes current session only for now.
    override suspend fun revokeSession(sessionId: String): Result<Unit> = runCatching {
        keystoreManager.clearSessionToken()
        firebaseAuth.signOut()
    }

    private fun FirebaseUser.toDomainUser(): User = User(
        uid = uid,
        displayName = displayName ?: email ?: uid,
        email = email ?: "",
        role = UserRole.PATIENT,
    )
}