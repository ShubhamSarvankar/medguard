# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Tink — crypto library must not be obfuscated
-keep class com.google.crypto.tink.** { *; }

# SQLCipher
-keep class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.** { *; }

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**

# Nearby Connections
-keep class com.google.android.gms.nearby.** { *; }

# Kotlin serialization (if added later)
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

# Keep data classes used with Firestore
-keepclassmembers class com.medguard.** {
    public <init>(...);
    <fields>;
}