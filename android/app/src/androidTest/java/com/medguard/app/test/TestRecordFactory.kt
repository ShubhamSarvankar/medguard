package com.medguard.app.test

import java.util.UUID

object TestRecordFactory {
    fun uniqueEmail() = "e2e.${UUID.randomUUID().toString().take(8)}@example.com"

    const val PASSWORD = "E2E-TestPass-123!"
    const val DISPLAY_NAME = "Test Patient Alpha"

    const val RECORD_TITLE = "Annual Checkup — Test Patient Alpha"
    const val RECORD_NOTES = "Patient Test Alpha. BP 120/80. SSN: 000-00-0001. No real PHI."
    const val RECORD_NOTES_UPDATED = "Edited: Patient Test Alpha. Follow-up in 6 months."
}
