package com.medguard.app.domain.model

data class CareCircleMember(
    val uid: String,
    val displayName: String,
    val role: String,
    val grantedAtMillis: Long,
    val grantedBy: String,
)
