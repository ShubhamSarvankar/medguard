package com.medguard.app

import android.app.Application
import com.google.firebase.Firebase
import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.auth.auth
import com.google.firebase.firestore.firestore
import com.google.firebase.initialize
import com.google.firebase.storage.storage
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class MedGuardApp : Application() {

    override fun onCreate() {
        super.onCreate()
        Firebase.initialize(this)

        if (BuildConfig.DEBUG) {
            try {
                val clazz = Class.forName("com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory")
                val factory = clazz.getDeclaredMethod("getInstance").invoke(null) as AppCheckProviderFactory
                Firebase.appCheck.installAppCheckProviderFactory(factory)
            } catch (_: Exception) {
                // Debug App Check provider not available
            }
            Firebase.auth.useEmulator("10.0.2.2", 9099)
            Firebase.firestore.useEmulator("10.0.2.2", 8080)
            Firebase.storage.useEmulator("10.0.2.2", 9199)
        } else {
            Firebase.appCheck.installAppCheckProviderFactory(
                PlayIntegrityAppCheckProviderFactory.getInstance()
            )
        }
    }
}