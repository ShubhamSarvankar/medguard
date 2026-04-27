package com.medguard.app.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.medguard.app.data.local.db.RecordDao
import com.medguard.app.data.local.db.RecordEntity
import com.medguard.app.data.local.db.RecordWithRelations
import com.medguard.app.data.remote.FirestoreDataSource
import com.medguard.app.domain.repository.RecordRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RecordRepositoryImpl @Inject constructor(
    private val recordDao: RecordDao,
    private val firestoreDataSource: FirestoreDataSource,
    @ApplicationContext private val context: Context,
) : RecordRepository {

    override fun observeRecords(uid: String): Flow<List<RecordWithRelations>> =
        recordDao.observeRecords(uid)

    override suspend fun getById(id: String): RecordWithRelations? =
        recordDao.getById(id)

    override suspend fun createRecord(record: RecordWithRelations): Result<Unit> = runCatching {
        recordDao.upsert(record.record)
        record.vitals?.let { recordDao.upsertVitals(it) }
        if (record.medications.isNotEmpty()) recordDao.upsertMedications(record.medications)
        if (record.diagnoses.isNotEmpty()) recordDao.upsertDiagnoses(record.diagnoses)
        if (record.attachments.isNotEmpty()) recordDao.upsertAttachments(record.attachments)

        if (isOnline()) {
            firestoreDataSource.upsertRecord(record.record)
                .onSuccess { recordDao.markSynced(record.record.recordId) }
        }
    }

    override suspend fun updateRecord(record: RecordWithRelations): Result<Unit> = runCatching {
        recordDao.upsert(record.record)
        record.vitals?.let { recordDao.upsertVitals(it) }
        if (record.medications.isNotEmpty()) recordDao.upsertMedications(record.medications)
        if (record.diagnoses.isNotEmpty()) recordDao.upsertDiagnoses(record.diagnoses)
        if (record.attachments.isNotEmpty()) recordDao.upsertAttachments(record.attachments)

        if (isOnline()) {
            firestoreDataSource.upsertRecord(record.record)
                .onSuccess { recordDao.markSynced(record.record.recordId) }
        }
    }

    override suspend fun deleteRecord(id: String): Result<Unit> = runCatching {
        recordDao.softDelete(id)
        if (isOnline()) {
            firestoreDataSource.deleteRecord(id)
        }
    }

    override suspend fun syncPending(): Result<Unit> = runCatching {
        if (!isOnline()) return@runCatching
        val pending = recordDao.getPendingSync()
        pending.forEach { record ->
            firestoreDataSource.upsertRecord(record)
                .onSuccess { recordDao.markSynced(record.recordId) }
        }
    }

    override suspend fun saveSharedRecord(record: RecordWithRelations): Result<Unit> = runCatching {
        val synced = record.copy(record = record.record.copy(isSynced = true))
        recordDao.upsert(synced.record)
        synced.vitals?.let { recordDao.upsertVitals(it) }
        if (synced.medications.isNotEmpty()) recordDao.upsertMedications(synced.medications)
        if (synced.diagnoses.isNotEmpty()) recordDao.upsertDiagnoses(synced.diagnoses)
        if (synced.attachments.isNotEmpty()) recordDao.upsertAttachments(synced.attachments)
    }

    private fun isOnline(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}