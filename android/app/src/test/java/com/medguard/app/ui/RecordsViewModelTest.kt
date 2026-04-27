package com.medguard.app.ui.records

import app.cash.turbine.test
import com.medguard.app.data.ConnectivityObserver
import com.medguard.app.data.NetworkStatus
import com.medguard.app.data.local.db.DiagnosisEntity
import com.medguard.app.data.local.db.MedicationEntity
import com.medguard.app.data.local.db.RecordEntity
import com.medguard.app.data.local.db.RecordWithRelations
import com.medguard.app.domain.model.User
import com.medguard.app.domain.model.UserRole
import com.medguard.app.domain.repository.AuthRepository
import com.medguard.app.domain.repository.RecordRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class RecordsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var recordRepository: RecordRepository
    private lateinit var authRepository: AuthRepository
    private lateinit var connectivityObserver: ConnectivityObserver
    private lateinit var networkStatusFlow: MutableSharedFlow<NetworkStatus>
    private lateinit var viewModel: RecordsViewModel

    private val testUser = User(
        uid = "uid-test",
        displayName = "Test User",
        email = "test@example.com",
        role = UserRole.PATIENT,
    )

    @BeforeEach
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        recordRepository = mockk()
        authRepository = mockk()
        connectivityObserver = mockk()
        networkStatusFlow = MutableSharedFlow(replay = 1)
        every { authRepository.currentUser } returns MutableStateFlow(testUser)
        every { connectivityObserver.networkStatus } returns networkStatusFlow
        coEvery { recordRepository.syncPending() } returns Result.success(Unit)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildRecord(
        id: String = "rec-1",
        title: String = "Test Record",
        visitDate: Long = 1_700_000_000L,
        isSynced: Boolean = true,
        diagnoses: List<DiagnosisEntity> = emptyList(),
        medications: List<MedicationEntity> = emptyList(),
    ) = RecordWithRelations(
        record = RecordEntity(
            recordId = id,
            ownerUid = testUser.uid,
            title = title,
            notes = "",
            visitDate = visitDate,
            createdAt = visitDate,
            updatedAt = visitDate,
            isSynced = isSynced,
        ),
        vitals = null,
        medications = medications,
        diagnoses = diagnoses,
        attachments = emptyList(),
    )

    private fun buildDiagnosis(recordId: String, code: String, description: String) =
        DiagnosisEntity("diag-$code", recordId, code, description, 0L)

    private fun buildMedication(recordId: String, name: String) =
        MedicationEntity("med-$name", recordId, name, "500", "mg", "daily", null, null)

    // -------------------------------------------------------------------------
    // UiState transitions
    // -------------------------------------------------------------------------

    @Test
    fun `initial state is Loading`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)
        assertEquals(RecordsUiState.Loading, viewModel.uiState.value)
    }

    @Test
    fun `emits Empty when repository returns empty list`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.uiState.test {
            testDispatcher.scheduler.advanceUntilIdle()
            val states = cancelAndConsumeRemainingEvents()
                .filterIsInstance<app.cash.turbine.Event.Item<RecordsUiState>>()
                .map { it.value }
            assertTrue(states.any { it is RecordsUiState.Empty })
        }
    }

    @Test
    fun `emits Success with records`() = runTest {
        val records = listOf(buildRecord("rec-1"), buildRecord("rec-2"))
        every { recordRepository.observeRecords(any()) } returns flowOf(records)
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.uiState.test {
            testDispatcher.scheduler.advanceUntilIdle()
            val states = cancelAndConsumeRemainingEvents()
                .filterIsInstance<app.cash.turbine.Event.Item<RecordsUiState>>()
                .map { it.value }
            assertEquals(2, states.filterIsInstance<RecordsUiState.Success>().last().records.size)
        }
    }

    @Test
    fun `emits Empty when user not authenticated`() = runTest {
        every { authRepository.currentUser } returns MutableStateFlow(null)
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.uiState.test {
            testDispatcher.scheduler.advanceUntilIdle()
            val states = cancelAndConsumeRemainingEvents()
                .filterIsInstance<app.cash.turbine.Event.Item<RecordsUiState>>()
                .map { it.value }
            assertTrue(states.any { it is RecordsUiState.Empty })
        }
    }

    // -------------------------------------------------------------------------
    // Search filter
    // -------------------------------------------------------------------------

    @Test
    fun `search by title filters records`() = runTest {
        val match = buildRecord("rec-1", title = "Cardiology Visit")
        val noMatch = buildRecord("rec-2", title = "Routine Checkup")
        every { recordRepository.observeRecords(any()) } returns flowOf(listOf(match, noMatch))
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.uiState.test {
            testDispatcher.scheduler.advanceUntilIdle()
            viewModel.onSearchQueryChanged("cardio")
            testDispatcher.scheduler.advanceTimeBy(400)
            testDispatcher.scheduler.advanceUntilIdle()
            val states = cancelAndConsumeRemainingEvents()
                .filterIsInstance<app.cash.turbine.Event.Item<RecordsUiState>>()
                .map { it.value }
            assertEquals(1, states.filterIsInstance<RecordsUiState.Success>().last().records.size)
        }
    }

    @Test
    fun `search by diagnosis code filters records`() = runTest {
        val match = buildRecord(
            "rec-1",
            diagnoses = listOf(buildDiagnosis("rec-1", "J06.9", "Upper respiratory")),
        )
        every { recordRepository.observeRecords(any()) } returns flowOf(listOf(match, buildRecord("rec-2")))
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.uiState.test {
            testDispatcher.scheduler.advanceUntilIdle()
            viewModel.onSearchQueryChanged("J06")
            testDispatcher.scheduler.advanceTimeBy(400)
            testDispatcher.scheduler.advanceUntilIdle()
            val states = cancelAndConsumeRemainingEvents()
                .filterIsInstance<app.cash.turbine.Event.Item<RecordsUiState>>()
                .map { it.value }
            assertEquals(1, states.filterIsInstance<RecordsUiState.Success>().last().records.size)
        }
    }

    @Test
    fun `search by medication name filters records`() = runTest {
        val match = buildRecord("rec-1", medications = listOf(buildMedication("rec-1", "Metformin")))
        every { recordRepository.observeRecords(any()) } returns flowOf(listOf(match, buildRecord("rec-2")))
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.uiState.test {
            testDispatcher.scheduler.advanceUntilIdle()
            viewModel.onSearchQueryChanged("metform")
            testDispatcher.scheduler.advanceTimeBy(400)
            testDispatcher.scheduler.advanceUntilIdle()
            val states = cancelAndConsumeRemainingEvents()
                .filterIsInstance<app.cash.turbine.Event.Item<RecordsUiState>>()
                .map { it.value }
            assertEquals(1, states.filterIsInstance<RecordsUiState.Success>().last().records.size)
        }
    }

    @Test
    fun `empty search shows all records`() = runTest {
        val records = listOf(buildRecord("rec-1"), buildRecord("rec-2"), buildRecord("rec-3"))
        every { recordRepository.observeRecords(any()) } returns flowOf(records)
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.uiState.test {
            testDispatcher.scheduler.advanceUntilIdle()
            viewModel.onSearchQueryChanged("")
            testDispatcher.scheduler.advanceTimeBy(400)
            testDispatcher.scheduler.advanceUntilIdle()
            val states = cancelAndConsumeRemainingEvents()
                .filterIsInstance<app.cash.turbine.Event.Item<RecordsUiState>>()
                .map { it.value }
            assertEquals(3, states.filterIsInstance<RecordsUiState.Success>().last().records.size)
        }
    }

    // -------------------------------------------------------------------------
    // Offline indicator — driven by ConnectivityObserver
    // -------------------------------------------------------------------------

    @Test
    fun `isOffline is false when network emits Available`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        networkStatusFlow.emit(NetworkStatus.Available)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(false, viewModel.isOffline.value)
    }

    @Test
    fun `isOffline is true when network emits Unavailable`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        networkStatusFlow.emit(NetworkStatus.Unavailable)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(true, viewModel.isOffline.value)
    }

    @Test
    fun `isOffline transitions correctly across multiple network changes`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.isOffline.test {
            assertEquals(false, awaitItem())

            networkStatusFlow.emit(NetworkStatus.Unavailable)
            testDispatcher.scheduler.advanceUntilIdle()
            assertEquals(true, awaitItem())

            networkStatusFlow.emit(NetworkStatus.Available)
            testDispatcher.scheduler.advanceUntilIdle()
            assertEquals(false, awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    // -------------------------------------------------------------------------
    // Auto-sync on reconnect
    // -------------------------------------------------------------------------

    @Test
    fun `syncPending called when network transitions from Unavailable to Available`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        networkStatusFlow.emit(NetworkStatus.Unavailable)
        testDispatcher.scheduler.advanceUntilIdle()
        networkStatusFlow.emit(NetworkStatus.Available)
        testDispatcher.scheduler.advanceUntilIdle()

        coVerify(exactly = 1) { recordRepository.syncPending() }
    }

    @Test
    fun `syncPending not called when network stays Available`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        networkStatusFlow.emit(NetworkStatus.Available)
        testDispatcher.scheduler.advanceUntilIdle()
        networkStatusFlow.emit(NetworkStatus.Available)
        testDispatcher.scheduler.advanceUntilIdle()

        coVerify(exactly = 0) { recordRepository.syncPending() }
    }

    @Test
    fun `syncPending not called when going from Available to Unavailable`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        networkStatusFlow.emit(NetworkStatus.Available)
        testDispatcher.scheduler.advanceUntilIdle()
        networkStatusFlow.emit(NetworkStatus.Unavailable)
        testDispatcher.scheduler.advanceUntilIdle()

        coVerify(exactly = 0) { recordRepository.syncPending() }
    }

    @Test
    fun `syncPending called on each reconnect event`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        repeat(3) {
            networkStatusFlow.emit(NetworkStatus.Unavailable)
            testDispatcher.scheduler.advanceUntilIdle()
            networkStatusFlow.emit(NetworkStatus.Available)
            testDispatcher.scheduler.advanceUntilIdle()
        }

        coVerify(exactly = 3) { recordRepository.syncPending() }
    }

    // -------------------------------------------------------------------------
    // Pull-to-refresh
    // -------------------------------------------------------------------------

    @Test
    fun `refresh calls syncPending`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.refresh()
        testDispatcher.scheduler.advanceUntilIdle()

        coVerify(atLeast = 1) { recordRepository.syncPending() }
    }

    @Test
    fun `isRefreshing is true during refresh and false after`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.isRefreshing.test {
            assertEquals(false, awaitItem())
            viewModel.refresh()
            assertEquals(true, awaitItem())
            testDispatcher.scheduler.advanceUntilIdle()
            assertEquals(false, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    // -------------------------------------------------------------------------
    // createRecord / deleteRecord (from 4.2)
    // -------------------------------------------------------------------------

    @Test
    fun `createRecord transitions Idle to Saving to Saved on success`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        coEvery { recordRepository.createRecord(any()) } returns Result.success(Unit)
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.editUiState.test {
            assertEquals(RecordEditUiState.Idle, awaitItem())
            viewModel.createRecord(
                ownerUid = testUser.uid,
                title = "Test",
                notes = "",
                visitDateMillis = System.currentTimeMillis(),
                vitals = null,
                medications = emptyList(),
                diagnoses = emptyList(),
                attachments = emptyList(),
            )
            assertEquals(RecordEditUiState.Saving, awaitItem())
            testDispatcher.scheduler.advanceUntilIdle()
            assertEquals(RecordEditUiState.Saved, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `createRecord transitions to Error on failure`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        coEvery { recordRepository.createRecord(any()) } returns Result.failure(Exception("DB error"))
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.editUiState.test {
            assertEquals(RecordEditUiState.Idle, awaitItem())
            viewModel.createRecord(
                ownerUid = testUser.uid,
                title = "Test",
                notes = "",
                visitDateMillis = System.currentTimeMillis(),
                vitals = null,
                medications = emptyList(),
                diagnoses = emptyList(),
                attachments = emptyList(),
            )
            assertEquals(RecordEditUiState.Saving, awaitItem())
            testDispatcher.scheduler.advanceUntilIdle()
            assertTrue(awaitItem() is RecordEditUiState.Error)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `deleteRecord transitions Idle to Deleting to Deleted on success`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        coEvery { recordRepository.deleteRecord(any()) } returns Result.success(Unit)
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)

        viewModel.editUiState.test {
            assertEquals(RecordEditUiState.Idle, awaitItem())
            viewModel.deleteRecord("rec-1")
            assertEquals(RecordEditUiState.Deleting, awaitItem())
            testDispatcher.scheduler.advanceUntilIdle()
            assertEquals(RecordEditUiState.Deleted, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    // -------------------------------------------------------------------------
    // Attachment validation
    // -------------------------------------------------------------------------

    @Test
    fun `validateAndAddAttachment returns true for valid PDF under 20MB`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)
        assertTrue(
            viewModel.validateAndAddAttachment("report.pdf", "application/pdf", 5L * 1024 * 1024, 0)
        )
    }

    @Test
    fun `validateAndAddAttachment returns false at count limit`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)
        assertTrue(
            !viewModel.validateAndAddAttachment("report.pdf", "application/pdf", 1024L, 10)
        )
    }

    @Test
    fun `validateAndAddAttachment returns false when file exceeds 20MB`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)
        assertTrue(
            !viewModel.validateAndAddAttachment("large.pdf", "application/pdf", 21L * 1024 * 1024, 0)
        )
    }

    @Test
    fun `validateAndAddAttachment returns false for unsupported mime type`() = runTest {
        every { recordRepository.observeRecords(any()) } returns flowOf(emptyList())
        viewModel = RecordsViewModel(recordRepository, authRepository, connectivityObserver)
        assertTrue(
            !viewModel.validateAndAddAttachment(
                "notes.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                1024L,
                0
            )
        )
    }
}