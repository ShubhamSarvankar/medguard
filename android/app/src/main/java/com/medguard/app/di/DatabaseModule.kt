package com.medguard.app.di

import android.content.Context
import com.medguard.app.data.local.db.MedGuardDatabase
import com.medguard.app.data.local.db.RecordDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    // DatabaseHolder defers the actual Room open until biometric auth supplies the passphrase.

    @Provides
    @Singleton
    fun provideDatabaseHolder(@ApplicationContext context: Context): DatabaseHolder =
        DatabaseHolder(context)

    @Provides
    fun provideRecordDao(holder: DatabaseHolder): RecordDao =
        holder.database.recordDao()
}

class DatabaseHolder(private val context: Context) {

    @Volatile
    private var _database: MedGuardDatabase? = null

    val database: MedGuardDatabase
        get() = _database ?: error(
            "Database not initialized. Call DatabaseHolder.initialize() after biometric auth."
        )

    fun initialize(keyBytes: ByteArray) {
        if (_database == null) {
            synchronized(this) {
                if (_database == null) {
                    _database = MedGuardDatabase.create(context, keyBytes)
                }
            }
        }
    }

    fun isInitialized(): Boolean = _database != null
}