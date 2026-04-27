package com.medguard.app.ui

import app.cash.turbine.test
import com.medguard.app.data.SessionManager
import com.medguard.app.domain.repository.AuthRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val sessionExpiredFlow = MutableSharedFlow<Unit>()
    private val sessionManager = mockk<SessionManager>()
    private val authRepository = mockk<AuthRepository>()

    private lateinit var viewModel: SessionViewModel

    @BeforeEach
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        every { sessionManager.sessionExpired } returns sessionExpiredFlow
        every { authRepository.currentUser } returns emptyFlow()
        coEvery { authRepository.logout() } returns Result.success(Unit)
        viewModel = SessionViewModel(sessionManager, authRepository)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `navigateToAuth emits when session expires`() = runTest {
        viewModel.navigateToAuth.test {
            sessionExpiredFlow.emit(Unit)
            testDispatcher.scheduler.advanceUntilIdle()
            awaitItem()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `logout is called when session expires`() = runTest {
        sessionExpiredFlow.emit(Unit)
        testDispatcher.scheduler.advanceUntilIdle()
        coVerify { authRepository.logout() }
    }

    @Test
    fun `recordActivity delegates to SessionManager`() {
        every { sessionManager.recordActivity() } returns Unit
        viewModel.recordActivity()
        io.mockk.verify { sessionManager.recordActivity() }
    }
}