# Android Release Packaging & Deployment Specification (A8)

**Card**: BT-38  
**Scope**: Release keystore generation, v1/v2/v3 signing, adaptive launcher icon, Android TV leanback banner, versioning scheme, build pipelines, and automated ADB device installation.  
**Platform**: Android 8.0+ (API 26 to API 36), Target: 75-inch Android TV (arm64-v8a) & Dev/CI Emulators (x86_64).

---

## 1. Release Keystore & Security Architecture

Per the strict security requirements of BT-38, the release signing key is generated and stored **strictly outside the git repository**. Passwords and private keys are never committed, checked into version control, or printed to terminal logs.

- **Keystore Path**: `%USERPROFILE%\.android\kiosk-release.keystore`
- **Configuration Properties**: `%USERPROFILE%\.android\kiosk-keystore.properties`
- **Key Alias**: `kiosk-release`
- **Algorithm**: RSA 2048-bit, SHA-256 with RSA, 10,000 days validity
- **Certificate DN**: `CN=Viitor Kiosk Player, OU=Engineering, O=Viitor, L=Mumbai, ST=Maharashtra, C=IN`

### Gradle Integration (`build.gradle.kts`)

The Android build pipeline dynamically checks for external release credentials via the `KIOSK_KEYSTORE_PROPERTIES` environment variable or standard user home path (`~/.android/kiosk-keystore.properties`):

```kotlin
val keystorePropsFile = file(
    System.getenv("KIOSK_KEYSTORE_PROPERTIES")
        ?: (System.getProperty("user.home") + "/.android/kiosk-keystore.properties")
)

android {
    signingConfigs {
        if (keystorePropsFile.exists()) {
            val keyProps = Properties().apply {
                keystorePropsFile.inputStream().use { load(it) }
            }
            create("release") {
                val storeFilePath = keyProps.getProperty("storeFile")
                if (storeFilePath != null) {
                    storeFile = file(storeFilePath)
                }
                storePassword = keyProps.getProperty("storePassword")
                keyAlias = keyProps.getProperty("keyAlias")
                keyPassword = keyProps.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = if (keystorePropsFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            optimization {
               enable = true
            }
        }
    }
}
```

If the release properties file is present, Gradle automatically signs the APK with the production keystore using APK Signature Scheme v1, v2, and v3. If absent (e.g. clean CI), it cleanly falls back to the debug signing key.

---

## 2. Versioning Scheme

We adopt the semantic versioning standard with integer milestone encoding:
- `tauri.conf.json`: `"version": "1.0.0"`
- `package.json`: `"version": "1.0.0"`
- `tauri.properties`:
  - `tauri.android.versionName=1.0.0`
  - `tauri.android.versionCode=10001` (Scheme: `MAJOR * 10000 + MINOR * 100 + PATCH`, allowing up to 99 patch releases per minor version).

---

## 3. Launcher Icons & Android TV Leanback Banner

### Adaptive Icons (`mipmap-anydpi-v26`)
Android 8.0+ adaptive icons are defined in `src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml`:
- **Background**: `#080C16` dark navy kiosk canvas (`drawable/ic_launcher_background.xml`).
- **Foreground**: Centered kiosk brand icon with electric blue accent (`mipmap-*/ic_launcher_foreground.png`).
- **Legacy Fallbacks**: High-density raster icons generated in `mipmap-mdpi` (48px), `mipmap-hdpi` (72px), `mipmap-xhdpi` (96px), `mipmap-xxhdpi` (144px), and `mipmap-xxxhdpi` (192px).

### Android TV Leanback Banner
Android TV launcher row cards require a 16:9 banner (320×180 xhdpi):
- **Path**: `src-tauri/gen/android/app/src/main/res/drawable/banner.png`
- **Resolution**: 320×180 px (Format: 32-bit ARGB PNG)
- **Manifest Declaration**:
  ```xml
  <application
      android:icon="@mipmap/ic_launcher"
      android:banner="@drawable/banner"
      ...>
      <activity
          android:banner="@drawable/banner"
          ...>
          <intent-filter>
              <action android:name="android.intent.action.MAIN" />
              <category android:name="android.intent.category.LAUNCHER" />
              <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
          </intent-filter>
      </activity>
  </application>
  ```

---

## 4. Build Pipeline (`npm run android:release`)

The release build is invoked via `npm run android:release`, executing `scripts/android-build.ps1 -Release`.

Pipeline stages:
1. Resolves JDK 17 (`JAVA_HOME`) and Android SDK / NDK r26c.
2. Compiles production frontend bundle (`npm run build` -> `tsc` + Vite chunk optimization).
3. Compiles Rust release shared libraries for target ABIs (`aarch64-linux-android` and `x86_64-linux-android`) via Tauri Android CLI.
4. Copies `.so` binaries into `jniLibs/<abi>/` to bypass Windows developer mode symlink limitations.
5. Invokes Gradle `assembleUniversalRelease` to produce a single Universal APK containing all native ABIs.
6. Runs Android SDK `apksigner verify --verbose` to cryptographically validate signatures (v1, v2, v3).

---

## 5. Automated Installation & Provisioning (`scripts/install-android.ps1`)

Automates full end-to-end device provisioning over ADB:

```powershell
# Usage:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-android.ps1
# Or via npm shortcut:
npm run android:install
```

### Automation Actions:
1. **Locate Device**: Automatically detects online Android TV or emulator via `adb wait-for-device`.
2. **Install APK**: Runs `adb install -r -d <release-apk>` without requiring user confirmation on device.
3. **Grant All-Files Storage**: Executes `adb shell appops set com.viitor.kioskplayer MANAGE_EXTERNAL_STORAGE allow`, granting full filesystem read/write access without prompting the user.
4. **Provision Media Folder**: Creates `/sdcard/Kiosk/Media`.
5. **Push Media**: Checks directory; if empty, automatically pushes Futurotec/sample media pairs from `C:\React\Videos`.
6. **Launch Kiosk**: Dispatches `adb shell am start -n com.viitor.kioskplayer/.MainActivity`.
7. **Verify Process**: Verifies running state via `adb shell pidof com.viitor.kioskplayer`.
