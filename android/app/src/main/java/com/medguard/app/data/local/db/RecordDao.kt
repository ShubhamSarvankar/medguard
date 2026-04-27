package com.medguard.app.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface RecordDao {

    @Transaction
    @Query("SELECT * FROM records WHERE ownerUid = :uid AND isDeletedLocally = 0 ORDER BY visitDate DESC")
    fun observeRecords(uid: String): Flow<List<RecordWithRelations>>

    @Transaction
    @Query("SELECT * FROM records WHERE recordId = :id AND isDeletedLocally = 0")
    suspend fun getById(id: String): RecordWithRelations?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(record: RecordEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertVitals(vitals: VitalsEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMedications(medications: List<MedicationEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertDiagnoses(diagnoses: List<DiagnosisEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAttachments(attachments: List<AttachmentEntity>)

    @Query("UPDATE records SET isDeletedLocally = 1 WHERE recordId = :id")
    suspend fun softDelete(id: String)

    @Query("UPDATE records SET isSynced = 1 WHERE recordId = :id")
    suspend fun markSynced(id: String)

    @Query("SELECT * FROM records WHERE isSynced = 0 AND isDeletedLocally = 0")
    suspend fun getPendingSync(): List<RecordEntity>

    @Transaction
    @Query("SELECT * FROM records WHERE ownerUid = :uid AND isDeletedLocally = 0 AND (title LIKE '%' || :query || '%')")
    fun searchByTitle(uid: String, query: String): Flow<List<RecordWithRelations>>
}