package com.medguard.app.data.remote

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.medguard.app.data.local.db.RecordEntity
import com.medguard.app.domain.model.AuditEntry
import com.medguard.app.domain.model.CareCircleMember
import com.medguard.app.domain.model.RecordAnnotation
import com.medguard.app.domain.model.User
import com.medguard.app.domain.model.UserRole
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirestoreDataSource @Inject constructor(
    private val firestore: FirebaseFirestore,
) {

    suspend fun upsertRecord(record: RecordEntity): Result<Unit> = runCatching {
        firestore
            .collection("records")
            .document(record.recordId)
            .set(record.toFirestoreMap())
            .await()
    }

    suspend fun deleteRecord(recordId: String): Result<Unit> = runCatching {
        firestore
            .collection("records")
            .document(recordId)
            .delete()
            .await()
    }

    // Only RecordEntity fields are mapped; vitals/medications/diagnoses require separate fetch.
    suspend fun fetchRecord(recordId: String): Result<RecordEntity?> = runCatching {
        val snap = firestore
            .collection("records")
            .document(recordId)
            .get()
            .await()

        if (!snap.exists()) return@runCatching null

        RecordEntity(
            recordId = snap.getString("recordId") ?: recordId,
            ownerUid = snap.getString("ownerUid") ?: "",
            title = snap.getString("title") ?: "",
            notes = snap.getString("notes") ?: "",
            visitDate = snap.getLong("visitDate") ?: 0L,
            createdAt = snap.getLong("createdAt") ?: 0L,
            updatedAt = snap.getLong("updatedAt") ?: 0L,
            isSynced = true,
            isDeletedLocally = false,
        )
    }

    suspend fun fetchAuditLog(uid: String, limit: Long = 20): Result<List<AuditEntry>> =
        runCatching {
            val snap = firestore
                .collection("auditLog")
                .whereEqualTo("actorUid", uid)
                .orderBy("timestamp", Query.Direction.DESCENDING)
                .limit(limit)
                .get()
                .await()

            snap.documents.mapNotNull { doc ->
                AuditEntry(
                    entryId = doc.getString("entryId") ?: return@mapNotNull null,
                    actorUid = doc.getString("actorUid") ?: return@mapNotNull null,
                    actionType = doc.getString("actionType") ?: return@mapNotNull null,
                    recordId = doc.getString("recordId"),
                    shareId = doc.getString("shareId"),
                    timestampMillis = doc.getTimestamp("timestamp")?.toDate()?.time ?: 0L,
                )
            }
        }

    suspend fun fetchPendingRecords(ownerUid: String): Result<List<RecordEntity>> =
        runCatching {
            val snap = firestore
                .collection("pendingRecords")
                .whereEqualTo("ownerUid", ownerUid)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .get()
                .await()

            snap.documents.mapNotNull { doc ->
                RecordEntity(
                    recordId = doc.getString("recordId") ?: return@mapNotNull null,
                    ownerUid = doc.getString("ownerUid") ?: "",
                    title = doc.getString("title") ?: "",
                    notes = doc.getString("notes") ?: "",
                    visitDate = doc.getLong("visitDate") ?: 0L,
                    createdAt = doc.getLong("createdAt") ?: 0L,
                    updatedAt = doc.getLong("updatedAt") ?: 0L,
                    isSynced = true,
                    isDeletedLocally = false,
                )
            }
        }

    suspend fun fetchAnnotations(recordId: String): Result<List<RecordAnnotation>> =
        runCatching {
            val snap = firestore
                .collection("records")
                .document(recordId)
                .collection("annotations")
                .orderBy("createdAt", Query.Direction.ASCENDING)
                .get()
                .await()

            snap.documents.mapNotNull { doc ->
                RecordAnnotation(
                    annotationId = doc.getString("annotationId") ?: return@mapNotNull null,
                    recordId = doc.getString("recordId") ?: recordId,
                    authorUid = doc.getString("authorUid") ?: return@mapNotNull null,
                    authorDisplayName = doc.getString("authorDisplayName") ?: "",
                    text = doc.getString("text") ?: "",
                    createdAtMillis = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0L,
                    updatedAtMillis = doc.getTimestamp("updatedAt")?.toDate()?.time,
                )
            }
        }

    suspend fun fetchUserProfile(uid: String): Result<User?> = runCatching {
        val snap = firestore.collection("users").document(uid).get().await()
        if (!snap.exists()) return@runCatching null
        User(
            uid = snap.getString("uid") ?: uid,
            displayName = snap.getString("displayName") ?: "",
            email = snap.getString("email") ?: "",
            role = UserRole.fromString(snap.getString("role") ?: "patient"),
        )
    }

    suspend fun fetchCareCircle(patientUid: String): Result<List<CareCircleMember>> = runCatching {
        val snap = firestore
            .collection("users")
            .document(patientUid)
            .collection("careCircle")
            .get()
            .await()
        snap.documents.mapNotNull { doc ->
            CareCircleMember(
                uid = doc.getString("uid") ?: return@mapNotNull null,
                displayName = doc.getString("displayName") ?: "",
                role = doc.getString("role") ?: "",
                grantedAtMillis = doc.getTimestamp("grantedAt")?.toDate()?.time ?: 0L,
                grantedBy = doc.getString("grantedBy") ?: "",
            )
        }
    }

    private fun RecordEntity.toFirestoreMap(): Map<String, Any?> = mapOf(
        "recordId" to recordId,
        "ownerUid" to ownerUid,
        "title" to title,
        "notes" to notes,
        "visitDate" to visitDate,
        "createdAt" to createdAt,
        "updatedAt" to updatedAt,
        "isDeidentified" to false,
        "status" to "active",
    )
}