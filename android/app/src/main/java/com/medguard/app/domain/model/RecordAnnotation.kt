package com.medguard.app.domain.model

data class RecordAnnotation(
    val annotationId: String,
    val recordId: String,
    val authorUid: String,
    val authorDisplayName: String,
    val text: String,
    val createdAtMillis: Long,
    val updatedAtMillis: Long?,
)
