package com.medguard.app.domain.repository

import com.medguard.app.data.local.db.RecordWithRelations
import kotlinx.coroutines.flow.Flow

interface RecordRepository {

    fun observeRecords(uid: String): Flow<List<RecordWithRelations>>

    suspend fun getById(id: String): RecordWithRelations?

    suspend fun createRecord(record: RecordWithRelations): Result<Unit>

    suspend fun updateRecord(record: RecordWithRelations): Result<Unit>

    suspend fun deleteRecord(id: String): Result<Unit>

    suspend fun syncPending(): Result<Unit>

    // Received-share records are already de-identified; written with isSynced=true, no upstream push.
    suspend fun saveSharedRecord(record: RecordWithRelations): Result<Unit>
}