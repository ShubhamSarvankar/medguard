package com.medguard.app.ui.auth

import app.cash.turbine.test
import com.medguard.app.domain.model.ActiveSession
import com.medguard.app.domain.model.User
import com.medguard.app.domain.model.UserRole
import com.medguard.app.domain.repository.AuthRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
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
class AuthViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val userFlow = MutableStateFlow<User?>(null)
    private val repository = mockk<AuthRepository>()

    private lateinit var viewModel: AuthViewModel

    private val fakeUser = User(
        uid = "uid-123",
        displayName = "Test Patient",
        email = "test@example.com",
        role = UserRole.PATIENT,
    )

    @BeforeEach
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        every { repository.currentUser } returns userFlow
        viewModel = AuthViewModel(repository)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is Idle when no user is authenticated`() = runTest {
        viewModel.uiState.test {
            assertEquals(AuthUiState.Idle, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `state becomes Authenticated when currentUser emits a user`() = runTest {
        viewModel.uiState.test {
            assertEquals(AuthUiState.Idle, awaitItem())
            userFlow.value = fakeUser
            assertEquals(AuthUiState.Authenticated(fakeUser), awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `state returns to Idle when authenticated user signs out`() = runTest {
        userFlow.value = fakeUser
        viewModel.uiState.test {
            assertEquals(AuthUiState.Authenticated(fakeUser), awaitItem())
            userFlow.value = null
            assertEquals(AuthUiState.Idle, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loginWithEmail emits Loading then Authenticated on success`() = runTest {
        coEvery { repository.loginWithEmail(any(), any(), any()) } returns Result.success(fakeUser)

        viewModel.uiState.test {
            assertEquals(AuthUiState.Idle, awaitItem())
            viewModel.loginWithEmail("test@example.com", "password123")
            assertEquals(AuthUiState.Loading, awaitItem())
            assertEquals(AuthUiState.Authenticated(fakeUser), awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loginWithEmail emits Loading then Error on failure`() = runTest {
        coEvery { repository.loginWithEmail(any(), any(), any()) } returns
            Result.failure(Exception("INVALID_LOGIN_CREDENTIALS"))

        viewModel.uiState.test {
            assertEquals(AuthUiState.Idle, awaitItem())
            viewModel.loginWithEmail("test@example.com", "wrongpassword")
            assertEquals(AuthUiState.Loading, awaitItem())
            val error = awaitItem()
            assertTrue(error is AuthUiState.Error)
            assertEquals("Incorrect email or password.", (error as AuthUiState.Error).message)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loginWithBiometric emits Loading then Authenticated on success`() = runTest {
        coEvery { repository.loginWithBiometric() } returns Result.success(fakeUser)

        viewModel.uiState.test {
            assertEquals(AuthUiState.Idle, awaitItem())
            viewModel.loginWithBiometric()
            assertEquals(AuthUiState.Loading, awaitItem())
            assertEquals(AuthUiState.Authenticated(fakeUser), awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loginWithBiometric emits Error when no existing session`() = runTest {
        coEvery { repository.loginWithBiometric() } returns
            Result.failure(Exception("No existing session"))

        viewModel.uiState.test {
            assertEquals(AuthUiState.Idle, awaitItem())
            viewModel.loginWithBiometric()
            assertEquals(AuthUiState.Loading, awaitItem())
            val error = awaitItem()
            assertTrue(error is AuthUiState.Error)
            assertTrue((error as AuthUiState.Error).message.contains("email first"))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `registerWithPasskey emits Loading then Authenticated on success`() = runTest {
        coEvery { repository.registerWithPasskey(any(), any()) } returns Result.success(fakeUser)

        viewModel.uiState.test {
            assertEquals(AuthUiState.Idle, awaitItem())
            viewModel.registerWithPasskey("Test Patient", "test@example.com")
            assertEquals(AuthUiState.Loading, awaitItem())
            assertEquals(AuthUiState.Authenticated(fakeUser), awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loginWithEmail shows rate limit message on too many attempts`() = runTest {
        coEvery { repository.loginWithEmail(any(), any(), any()) } returns
            Result.failure(Exception("TOO_MANY_ATTEMPTS_TRY_LATER"))

        viewModel.uiState.test {
            awaitItem()
            viewModel.loginWithEmail("test@example.com", "password")
            awaitItem() // Loading
            val error = awaitItem() as AuthUiState.Error
            assertTrue(error.message.contains("Too many attempts"))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `clearError resets Error state to Idle`() = runTest {
        coEvery { repository.loginWithEmail(any(), any(), any()) } returns
            Result.failure(Exception("NETWORK_ERROR"))

        viewModel.uiState.test {
            awaitItem()
            viewModel.loginWithEmail("test@example.com", "password")
            awaitItem() // Loading
            awaitItem() // Error
            viewModel.clearError()
            assertEquals(AuthUiState.Idle, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `logout calls repository logout`() = runTest {
        coEvery { repository.logout() } returns Result.success(Unit)
        viewModel.logout()
        testDispatcher.scheduler.advanceUntilIdle()
        coVerify { repository.logout() }
    }
}