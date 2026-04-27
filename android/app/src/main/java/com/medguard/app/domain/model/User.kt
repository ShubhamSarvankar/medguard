package com.medguard.app.domain.model

data class User(
    val uid: String,
    val displayName: String,
    val email: String,
    val role: UserRole,
)

enum class UserRole {
    PATIENT, CARETAKER, CLINICIAN;

    companion object {
        fun fromString(value: String): UserRole = when (value) {
            "patient" -> PATIENT
            "caretaker" -> CARETAKER
            "clinician" -> CLINICIAN
            else -> PATIENT
        }
    }
}

data class ActiveSession(
    val sessionId: String,
    val deviceInfo: String,
    val lastActive: Long,
    val isCurrent: Boolean,
)