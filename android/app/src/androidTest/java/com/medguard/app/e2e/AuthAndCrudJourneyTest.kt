package com.medguard.app.e2e

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.filterToOne
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
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
 * Journey 1: Register → email login → create → view → edit → delete (with confirmation).
 * Requires Firebase Auth + Firestore emulators to be running.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class AuthAndCrudJourneyTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun setUp() {
        hiltRule.inject()
    }

    @Test
    fun registerLoginCreateViewEditDelete_fullCrudJourney() = with(composeRule) {
        val email = TestRecordFactory.uniqueEmail()

        // ── Register ──────────────────────────────────────────────────────────
        onNodeWithText("Don't have an account? Register").performClick()
        onNodeWithText("Full name").performTextInput(TestRecordFactory.DISPLAY_NAME)
        onNodeWithText("Email").performTextInput(email)
        onNodeWithText("Password").performTextInput(TestRecordFactory.PASSWORD)
        onNodeWithText("Create account").performClick()

        waitUntil(timeoutMillis = 20_000) {
            onAllNodesWithText("Medical Records").fetchSemanticsNodes().isNotEmpty()
        }

        // ── Create record ─────────────────────────────────────────────────────
        onNodeWithContentDescription("Create record").performClick()
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithText("New Record").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Title *").performTextInput(TestRecordFactory.RECORD_TITLE)
        onNodeWithText("Notes").performTextInput(TestRecordFactory.RECORD_NOTES)
        onNodeWithText("Create Record").performClick()

        // ── Record appears in list ─────────────────────────────────────────────
        waitUntil(timeoutMillis = 20_000) {
            onAllNodesWithText(TestRecordFactory.RECORD_TITLE).fetchSemanticsNodes().isNotEmpty()
        }

        // ── View detail ───────────────────────────────────────────────────────
        onNodeWithText(TestRecordFactory.RECORD_TITLE).performClick()
        waitUntil(timeoutMillis = 10_000) {
            onAllNodesWithContentDescription("Edit").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText(TestRecordFactory.RECORD_NOTES).assertIsDisplayed()

        // ── Edit record ───────────────────────────────────────────────────────
        onNodeWithContentDescription("Edit").performClick()
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithText("Edit Record").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Notes").performTextClearance()
        onNodeWithText("Notes").performTextInput(TestRecordFactory.RECORD_NOTES_UPDATED)
        onNodeWithText("Save Changes").performClick()

        // ── Updated notes visible in detail ───────────────────────────────────
        waitUntil(timeoutMillis = 15_000) {
            onAllNodesWithText(TestRecordFactory.RECORD_NOTES_UPDATED).fetchSemanticsNodes().isNotEmpty()
        }

        // ── Delete with confirmation ──────────────────────────────────────────
        onNodeWithContentDescription("Delete").performClick()
        onNodeWithText("Delete record?").assertIsDisplayed()
        onAllNodesWithText("Delete").filterToOne(hasAnyAncestor(isDialog())).performClick()

        // ── Record gone from list ─────────────────────────────────────────────
        waitUntil(timeoutMillis = 10_000) {
            onAllNodesWithText("Medical Records").fetchSemanticsNodes().isNotEmpty()
        }
        onAllNodesWithText(TestRecordFactory.RECORD_TITLE).assertCountEquals(0)
    }
}
