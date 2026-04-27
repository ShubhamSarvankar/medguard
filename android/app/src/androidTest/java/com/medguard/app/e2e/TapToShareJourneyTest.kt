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
import com.medguard.app.MainActivity
import com.medguard.app.test.TestRecordFactory
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Journey 2: Tap-to-share — initiate side on a single device.
 * Multi-device transfer (device A → device B) requires two physical devices
 * and is verified manually. This test covers the initiate state machine:
 * ShareScreen appears, Tap tab is selected, "Start Tap Share" triggers the
 * Connecting → WaitingForTap transition.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class TapToShareJourneyTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun setUp() {
        hiltRule.inject()
    }

    @Test
    fun tapShareInitiate_shareScreenShowsWaitingState() = with(composeRule) {
        loginAndCreateRecord(TestRecordFactory.uniqueEmail(), TestRecordFactory.RECORD_TITLE)

        // Navigate to detail → share
        onNodeWithText(TestRecordFactory.RECORD_TITLE).performClick()
        waitUntil(timeoutMillis = 10_000) {
            onAllNodesWithContentDescription("Share").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithContentDescription("Share").performClick()

        // Share screen: all three tabs present
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithText("Share Record").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Tap").assertIsDisplayed()
        onNodeWithText("Code").assertIsDisplayed()
        onNodeWithText("Enter Code").assertIsDisplayed()

        // Tap tab is default; initiate share
        onNodeWithText("Start Tap Share").assertIsDisplayed()
        onNodeWithText("Start Tap Share").performClick()

        // App transitions to waiting-for-tap or connecting state
        waitUntil(timeoutMillis = 10_000) {
            onAllNodesWithText("Hold devices together").fetchSemanticsNodes().isNotEmpty() ||
                onAllNodesWithText("Connecting...").fetchSemanticsNodes().isNotEmpty()
        }
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
}
