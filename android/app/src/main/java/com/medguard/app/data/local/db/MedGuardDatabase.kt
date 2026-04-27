package com.medguard.app.data.local.db

import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import android.content.Context
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

@Database(
    entities = [
        RecordEntity::class,
        VitalsEntity::class,
        MedicationEntity::class,
        DiagnosisEntity::class,
        AttachmentEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class MedGuardDatabase : RoomDatabase() {

    abstract fun recordDao(): RecordDao

    companion object {

        // T04: database is SQLCipher-encrypted. keyBytes must be supplied after biometric auth
        // unlocks the Keystore-backed key; on emulator any non-empty ByteArray is acceptable.
        fun create(context: Context, keyBytes: ByteArray): MedGuardDatabase {
            val factory = SupportOpenHelperFactory(keyBytes)
            return Room.databaseBuilder(
                context.applicationContext,
                MedGuardDatabase::class.java,
                "medguard.db",
            )
                .openHelperFactory(factory)
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
