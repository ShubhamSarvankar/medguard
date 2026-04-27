package com.medguard.app.domain.model

data class AuditEntry(
    val entryId: String,
    val actorUid: String,
    val actionType: String,
    val recordId: String?,
    val shareId: String?,
    val timestampMillis: Long,
)
