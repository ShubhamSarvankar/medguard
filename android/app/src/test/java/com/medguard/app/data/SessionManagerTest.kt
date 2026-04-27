package com.medguard.app.data

import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionManagerTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeEach
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `sessionExpired emits after idle timeout elapses`() = runTest(testDispatcher) {
        val manager = SessionManager()
        manager.sessionExpired.test {
            advanceTimeBy(SessionManager.IDLE_TIMEOUT_MS + 1)
            awaitItem()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `recordActivity resets the idle timer`() = runTest(testDispatcher) {
        val manager = SessionManager()
        manager.sessionExpired.test {
            advanceTimeBy(SessionManager.IDLE_TIMEOUT_MS - 1000)
            manager.recordActivity()
            advanceTimeBy(SessionManager.IDLE_TIMEOUT_MS - 1000)
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `cancelTimer prevents sessionExpired from emitting`() = runTest(testDispatcher) {
        val manager = SessionManager()
        manager.sessionExpired.test {
            manager.cancelTimer()
            advanceTimeBy(SessionManager.IDLE_TIMEOUT_MS + 1)
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }
}