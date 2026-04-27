package com.medguard.app.data.remote

import com.google.firebase.storage.FirebaseStorage
import javax.inject.Inject
import javax.inject.Singleton

// Stub — full attachment upload/download implemented in Phase 4; exists to satisfy the DI graph.
@Singleton
class StorageDataSource @Inject constructor(
    private val storage: FirebaseStorage,
)