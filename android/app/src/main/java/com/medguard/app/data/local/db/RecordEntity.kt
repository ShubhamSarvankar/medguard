package com.medguard.app.data.local.db

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey
import androidx.room.Relation

@Entity(tableName = "records")
data class RecordEntity(
    @PrimaryKey val recordId: String,
    val ownerUid: String,
    val title: String,
    val notes: String,
    val visitDate: Long,
    val createdAt: Long,
    val updatedAt: Long,
    val isSynced: Boolean = false,
    val isDeletedLocally: Boolean = false,
)

@Entity(
    tableName = "vitals",
    foreignKeys = [
        ForeignKey(
            entity = RecordEntity::class,
            parentColumns = ["recordId"],
            childColumns = ["recordId"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
)
data class VitalsEntity(
    @PrimaryKey val vitalsId: String,
    val recordId: String,
    val bloodPressureSystolic: Int?,
    val bloodPressureDiastolic: Int?,
    val heartRateBpm: Int?,
    val weightKg: Float?,
    val temperatureCelsius: Float?,
    val recordedAt: Long,
)

@Entity(
    tableName = "medications",
    foreignKeys = [
        ForeignKey(
            entity = RecordEntity::class,
            parentColumns = ["recordId"],
            childColumns = ["recordId"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
)
data class MedicationEntity(
    @PrimaryKey val medicationId: String,
    val recordId: String,
    val name: String,
    val doseAmount: String,
    val doseUnit: String,
    val frequency: String,
    val startDate: Long?,
    val endDate: Long?,
)

@Entity(
    tableName = "diagnoses",
    foreignKeys = [
        ForeignKey(
            entity = RecordEntity::class,
            parentColumns = ["recordId"],
            childColumns = ["recordId"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
)
data class DiagnosisEntity(
    @PrimaryKey val diagnosisId: String,
    val recordId: String,
    val code: String,
    val description: String,
    val diagnosedAt: Long,
)

@Entity(
    tableName = "attachments",
    foreignKeys = [
        ForeignKey(
            entity = RecordEntity::class,
            parentColumns = ["recordId"],
            childColumns = ["recordId"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
)
data class AttachmentEntity(
    @PrimaryKey val attachmentId: String,
    val recordId: String,
    val fileName: String,
    val mimeType: String,
    val localFilePath: String,
    val storagePath: String?,
    val sizeBytes: Long,
    val uploadedAt: Long?,
)

data class RecordWithRelations(
    @Embedded val record: RecordEntity,
    @Relation(parentColumn = "recordId", entityColumn = "recordId")
    val vitals: VitalsEntity?,
    @Relation(parentColumn = "recordId", entityColumn = "recordId")
    val medications: List<MedicationEntity>,
    @Relation(parentColumn = "recordId", entityColumn = "recordId")
    val diagnoses: List<DiagnosisEntity>,
    @Relation(parentColumn = "recordId", entityColumn = "recordId")
    val attachments: List<AttachmentEntity>,
)