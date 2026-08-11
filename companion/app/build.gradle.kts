plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.meshman.thebrain.companion"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.meshman.thebrain.companion"
        // Health Connect ships as an APK from Android 9 and is built into
        // Android 14+. Jay's phone is recent; 28 keeps the surface small.
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // The same two values the web app's .env.local carries. The anon key
        // is safe in a client — RLS is what protects the data (CLAUDE.md A4).
        buildConfigField(
            "String",
            "SUPABASE_URL",
            "\"https://qttroyuajpyelfrbxzzt.supabase.co\""
        )
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            "\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0dHJveXVhanB5ZWxmcmJ4enp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjQwMDksImV4cCI6MjEwMDkwMDAwOX0.muynOFWFRc8xrWvpW-BgawY8KTo55aQdD1NQpFxg4WQ\""
        )
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Health Connect — the on-device hub Samsung Health syncs into.
    implementation("androidx.health.connect:connect-client:1.1.0-alpha07")

    // The daily sync.
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // The refresh token at rest.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Plain HTTP to Supabase — REST + GoTrue, no SDK weight.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}
