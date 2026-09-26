plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    // Kotlin package of the generated host activity. Changing this means moving source
    // files, so it stays as generated; it does not need to equal applicationId.
    namespace = "com.scanmymandir.scan_my_mandir"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Permanent once published to Play: an application ID cannot be changed
        // afterwards. Confirm at P12-01 before the first upload.
        applicationId = "com.scanmymandir.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        debug {
            // Lets a debug build coexist with a release build on one device.
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            // Debug keys for now so `flutter run --release` works locally. A real upload
            // key and key.properties are set up at P12-01; key.properties is gitignored
            // and the keystore must never be committed.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
