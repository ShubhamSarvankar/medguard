package com.medguard.app.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.medguard.app.data.local.db.RecordDao
import com.medguard.app.data.local.db.RecordEntity
import com.medguard.app.data.local.db.RecordWithRelations
import com.medguard.app.data.remote.FirestoreDataSource
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertTrue

class RecordRepositoryTest {

    private val recordDao = mockk<RecordDao>(relaxed = true)
    private val firestoreDataSource = mockk<FirestoreDataSource>(relaxed = true)
    private val context = mockk<Context>()
    private val connectivityManager = mockk<ConnectivityManager>()
    private val network = mockk<Network>()
    private val networkCapabilities = mockk<NetworkCapabilities>()

    private lateinit var repository: RecordRepositoryImpl

    private val fakeRecord = RecordWithRelations(
        record = RecordEntity(
            recordId = "record-123",
            ownerUid = "user-456",
            title = "Test Record",
            notes = "Test notes",
            visitDate = 1000L,
            createdAt = 1000L,
            updatedAt = 1000L,
            isSynced = false,
        ),
        vitals = null,
        medications = emptyList(),
        diagnoses = emptyList(),
        attachments = emptyList(),
    )

    @BeforeEach
    fun setUp() {
        every { context.getSystemService(Context.CONNECTIVITY_SERVICE) } returns connectivityManager
        repository = RecordRepositoryImpl(recordDao, firestoreDataSource, context)
    }

    private fun setOnline(online: Boolean) {
        if (online) {
            every { connectivityManager.activeNetwork } returns network
            every { connectivityManager.getNetworkCapabilities(network) } returns networkCapabilities
            every { networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) } returns true
        } else {
            every { connectivityManager.activeNetwork } returns null
        }
    }

    @Test
    fun `createRecord offline marks record as unsynced and skips Firestore`() = runTest {
        setOnline(false)
        coEvery { recordDao.upsert(any()) } returns Unit

        repository.createRecord(fakeRecord)

        coVerify(exactly = 0) { firestoreDataSource.upsertRecord(any()) }
    }

    @Test
    fun `createRecord online writes to Room and Firestore`() = runTest {
        setOnline(true)
        coEvery { recordDao.upsert(any()) } returns Unit
        coEvery { firestoreDataSource.upsertRecord(any()) } returns Result.success(Unit)
        coEvery { recordDao.markSynced(any()) } returns Unit

        repository.createRecord(fakeRecord)

        coVerify { recordDao.upsert(fakeRecord.record) }
        coVerify { firestoreDataSource.upsertRecord(fakeRecord.record) }
        coVerify { recordDao.markSynced("record-123") }
    }

    @Test
    fun `syncPending skips Firestore when offline`() = runTest {
        setOnline(false)

        repository.syncPending()

        coVerify(exactly = 0) { firestoreDataSource.upsertRecord(any()) }
    }

    @Test
    fun `syncPending online syncs all pending records`() = runTest {
        setOnline(true)
        val pending = listOf(fakeRecord.record)
        coEvery { recordDao.getPendingSync() } returns pending
        coEvery { firestoreDataSource.upsertRecord(any()) } returns Result.success(Unit)
        coEvery { recordDao.markSynced(any()) } returns Unit

        repository.syncPending()

        coVerify { firestoreDataSource.upsertRecord(fakeRecord.record) }
        coVerify { recordDao.markSynced("record-123") }
    }

    @Test
    fun `syncPending is idempotent — duplicate call does not double-write`() = runTest {
        setOnline(true)
        val pending = listOf(fakeRecord.record)
        coEvery { recordDao.getPendingSync() } returns pending andThen emptyList()
        coEvery { firestoreDataSource.upsertRecord(any()) } returns Result.success(Unit)
        coEvery { recordDao.markSynced(any()) } returns Unit

        repository.syncPending()
        repository.syncPending()

        coVerify(exactly = 1) { firestoreDataSource.upsertRecord(fakeRecord.record) }
    }

    @Test
    fun `createRecord returns success result`() = runTest {
        setOnline(false)
        coEvery { recordDao.upsert(any()) } returns Unit

        val result = repository.createRecord(fakeRecord)

        assertTrue(result.isSuccess)
    }

    @Test
    fun `deleteRecord calls softDelete on DAO`() = runTest {
        setOnline(false)
        coEvery { recordDao.softDelete(any()) } returns Unit

        repository.deleteRecord("record-123")

        coVerify { recordDao.softDelete("record-123") }
    }
}