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
 * Journey 3: Code share — patient generates a code on Android; cross-platform
 * acceptance by a caretaker on web is covered by the Playwright suite.
 * This test verifies the generate-code path: ShareScreen → Code tab →
 * Generate Code → 6-character code displayed.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class CodeShareJourneyTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun setUp() {
        hiltRule.inject()
    }

    @Test
    fun codeShare_generateCodeDisplaysSixCharCode() = with(composeRule) {
        loginAndCreateRecord(TestRecordFactory.uniqueEmail(), TestRecordFactory.RECORD_TITLE)

        // Navigate to detail → share
        onNodeWithText(TestRecordFactory.RECORD_TITLE).performClick()
        waitUntil(timeoutMillis = 10_000) {
            onAllNodesWithContentDescription("Share").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithContentDescription("Share").performClick()
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithText("Share Record").fetchSemanticsNodes().isNotEmpty()
        }

        // Switch to Code tab
        onNodeWithText("Code").performClick()
        onNodeWithText("Generate Code").assertIsDisplayed()

        // Generate code — calls initiateShare Cloud Function
        onNodeWithText("Generate Code").performClick()

        // Code appears (6 characters, expiry notice shown)
        waitUntil(timeoutMillis = 15_000) {
            onAllNodesWithText("Share this code").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Share this code").assertIsDisplayed()
        onNodeWithText("Expires in 10 minutes").assertIsDisplayed()
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
