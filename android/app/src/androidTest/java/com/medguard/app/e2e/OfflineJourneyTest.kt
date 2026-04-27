package com.medguard.app.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit4.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.medguard.app.MainActivity
import com.medguard.app.test.TestRecordFactory
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Journey 4: Offline — create and sync a record while online, disable network,
 * verify the record remains readable from Room, re-enable and verify no data loss.
 * Uses `svc wifi disable/enable` via UiAutomation (works on API 26+ emulators).
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class OfflineJourneyTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    private val uiAutomation = InstrumentationRegistry.getInstrumentation().uiAutomation

    @Before
    fun setUp() {
        hiltRule.inject()
        enableNetwork()
    }

    @After
    fun tearDown() {
        // Always re-enable in case the test fails mid-flight
        enableNetwork()
    }

    @Test
    fun offline_recordRemainsReadableFromRoomWhenNetworkUnavailable() = with(composeRule) {
        val email = TestRecordFactory.uniqueEmail()

        // Create a record while online so it lands in Room
        loginAndCreateRecord(email, TestRecordFactory.RECORD_TITLE)

        // Confirm record is visible
        onNodeWithText(TestRecordFactory.RECORD_TITLE).assertIsDisplayed()

        // Disable network
        disableNetwork()
        waitUntil(timeoutMillis = 10_000) {
            onAllNodesWithText("You're offline. Records are read-only.")
                .fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("You're offline. Records are read-only.").assertIsDisplayed()

        // Record still visible from Room even while offline
        onNodeWithText(TestRecordFactory.RECORD_TITLE).assertIsDisplayed()

        // Navigate to detail — still readable
        onNodeWithText(TestRecordFactory.RECORD_TITLE).performClick()
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithContentDescription("Edit").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText(TestRecordFactory.RECORD_TITLE).assertIsDisplayed()

        // Re-enable network
        enableNetwork()
        waitUntil(timeoutMillis = 15_000) {
            // Offline banner disappears when network returns
            onAllNodesWithText("You're offline. Records are read-only.")
                .fetchSemanticsNodes().isEmpty()
        }

        // Record still present after re-connect — no data loss
        onNodeWithText(TestRecordFactory.RECORD_TITLE).assertIsDisplayed()
    }

    private fun loginAndCreateRecord(email: String, title: String) = with(composeRule) {
        onNodeWithText("Don't have an account? Register").performClick()
        onNodeWithText("Full name").performTextInput(TestRecordFactory.DISPLAY_NAME)
        onNodeWithText("Email").performTextInput(email)
        onNodeWithText("Password").performTextInput(TestRecordFactory.PASSWORD)
        onNodeWithText("Create account").performClick()
        waitUntil(timeoutMillis = 20_000) {
            onAllNodesWithText("Medical Records").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithContentDescription("Create record").performClick()
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithText("New Record").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Title *").performTextInput(title)
        onNodeWithText("Create Record").performClick()
        waitUntil(timeoutMillis = 20_000) {
            onAllNodesWithText(title).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun disableNetwork() {
        uiAutomation.executeShellCommand("svc wifi disable").close()
        uiAutomation.executeShellCommand("svc data disable").close()
    }

    private fun enableNetwork() {
        uiAutomation.executeShellCommand("svc wifi enable").close()
        uiAutomation.executeShellCommand("svc data enable").close()
    }
}
