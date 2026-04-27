package com.medguard.app.di

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import com.medguard.app.data.RecordRepositoryImpl
import com.medguard.app.domain.repository.RecordRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindRecordRepository(impl: RecordRepositoryImpl): RecordRepository
}

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    // PRODUCTION: replace zero-value placeholder hashes with real leaf + backup SPKI pin hashes.
    // Pin rotation: ship both current + backup hashes 30 days before leaf cert expiry, then drop
    // the old pin after 99%+ of installs are updated. A mismatch throws SSLPeerUnverifiedException.
    // This client is NOT wired into Firebase's internal OkHttp — it is the injection point for
    // future direct-HTTP calls and NetworkPinningTest. Pinning is intentionally skipped on emulator.

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val pinner = CertificatePinner.Builder()
            .add("*.firebaseapp.com",    "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .add("*.googleapis.com",     "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .add("*.cloudfunctions.net", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .add("*.firebaseio.com",     "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .build()
        return OkHttpClient.Builder()
            .certificatePinner(pinner)
            .build()
    }

    @Provides
    @Singleton
    fun provideFirestore(): FirebaseFirestore = FirebaseFirestore.getInstance()

    @Provides
    @Singleton
    fun provideStorage(): FirebaseStorage = FirebaseStorage.getInstance()

    @Provides
    @Singleton
    fun provideFirebaseFunctions(): FirebaseFunctions = FirebaseFunctions.getInstance()
}
