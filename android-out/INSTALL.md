# Kiosk Video Player — Android Sideload & Test Guide (v1.0.2 Production Release)

This folder contains the production signed Universal Release APK (`arm64-v8a` + `armeabi-v7a` + `x86_64`) for deployment on 75-inch touch Android TVs and Teachmint interactive touch panels.

## Build Information
- **File**: `kiosk-video-player-v1.0.2.apk`
- **Version**: 1.0.2 (versionCode 10003)
- **Size**: 14,991,445 bytes (14.3 MB)
- **Built**: 2026-11-27 (Signed with official release keystore via APK Signature Scheme v2)
- **SHA-256**: `f284f55068d2e75abcf7016422327bc5c7951a89f8569a8a7fe649a3ea4dcc05`
- **Certificate DN**: `CN=Viitor Kiosk Player, OU=Engineering, O=Viitor, L=Mumbai, ST=Maharashtra, C=IN`
- **Architectures**:
  - `arm64-v8a`: 64-bit ARM (standard Android TV 12+ targets)
  - `armeabi-v7a`: 32-bit ARM (for panels running 32-bit userland e.g. Teachmint C-T982-81-A62D)
  - `x86_64`: 64-bit x86 (emulator / developer workstations)

### Inspecting Target Device CPU Architecture
To check which ABI your target display / panel requires, connect over ADB and run:
```powershell
adb shell getprop ro.product.cpu.abilist
```

### Android System WebView Compatibility & Verification
The web application is compiled specifically targeting **Chrome 80+ / ES2019** with CSS fallbacks for older WebView builds.
- Check the active WebView version on the panel: **Settings > Apps > Android System WebView** (or **Developer Options > WebView implementation**).
- Alternatively, launch the app, open the Admin Panel (long press top-left corner for 2 seconds), and tap **Run Diagnostics**. The generated report at `/sdcard/Kiosk/diagnostics.txt` prints the live browser engine as the very first line (`WebView Engine: Chrome/X.X.X.X`).
- **Support claim**: Build targets Chrome 80+, unverified on physical Teachmint panel until sideload. If an older WebView (< Chrome 80) causes visual issues, updating the Android System WebView APK via USB sideload is strongly advised.

## Option A: One-Command Automated Install (Recommended via `adb`)

Run the automated provisioning script from the repository root:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-android.ps1
# Or via npm:
npm run android:install
```

This script automatically:
1. Waits for the TV to be online over ADB
2. Installs `kiosk-video-player-v1.0.1.apk` with `-r -d`
3. Automatically grants `MANAGE_EXTERNAL_STORAGE` permission via `appops`
4. Creates `/sdcard/Kiosk/Media`
5. Pushes sample Futurotec media pairs if empty
6. Launches `com.viitor.kioskplayer/.MainActivity`
7. Verifies process execution and reports active PID

## Option B: Install without `adb` (USB Flash Drive / TV File Manager)

1. Copy `kiosk-video-player-v1.0.1.apk` onto a USB flash drive.
2. Plug the USB drive into the Android TV and open the TV's **File Manager** app.
3. Tap the `.apk` file to install.
   - If prompted, open **Settings -> Install unknown apps** and enable permission for your File Manager.
4. Launch **Kiosk Video Player**.
5. On first launch, tap **Grant file access** -> enable **Allow access to manage all files** for **Kiosk Video Player**, then press **Back** to return to the app.

## Where to Put Media & Config

- **Media folder**: `/sdcard/Kiosk/Media/` (canonical `/storage/emulated/0/Kiosk/Media/`)
  - Put `<name>.mp4` + `<name>.png` (or `.jpg` / `.jpeg`) pairs in the root of `/sdcard/Kiosk/Media/`.
  - **Screensaver (idle loop)**: put `Screensaver.mp4` (case-insensitive) in `/sdcard/Kiosk/Media/`. It is automatically excluded from the gallery cards and loops seamlessly when idle.
- **Optional config overrides**: `/sdcard/Kiosk/kiosk.env`
  ```ini
  KIOSK_MEDIA_ROOT=/storage/emulated/0/Kiosk/Media
  IDLE_TIMEOUT_SECONDS=60
  CONTROLS_AUTO_HIDE_SECONDS=4
  SLIDESHOW_MODE=screensaver
  SCREENSAVER_SOUND=true
  CARDS_PER_PAGE=12
  SFX_ENABLED=true
  RETURN_TO_GALLERY_ON_END=true
  ```

## Admin Panel Access

- **Touch (75" TV)**: Press and hold the top-left corner of the screen for 2 seconds.
- **Keyboard / Dev**: `Ctrl+Alt+S`.
- The Admin Panel provides:
  - Current media path and folder browse/validate
  - Live counts for playable pairs, orphans, videos, and images
  - Screensaver status check
  - Embedded hardware test playback player with audio
  - Kiosk exit button

## Android Kiosk Mode (A6) Features & Setup

1. **Sticky Immersive Fullscreen**:
   - Status bar and navigation bar are hidden by default via `WindowInsetsControllerCompat`.
   - Transient bars appear momentarily only if swiped from the physical screen edge, and automatically re-hide after 2 seconds.
   - Immersive mode is re-asserted on `onWindowFocusChanged` and `onResume`.

2. **Continuous Keep-Awake**:
   - Window flag `FLAG_KEEP_SCREEN_ON` is active so the 75-inch TV display never sleeps, dims, or locks while running.

3. **Hardware Back Button / Edge Gesture Lock**:
   - Hardware Back button and back swipe gestures are intercepted by `onBackPressedDispatcher` with a no-op callback, preventing visitors from exiting or dismissing the app.

4. **Auto-Launch on Device Boot**:
   - `BootReceiver` listens for `ACTION_BOOT_COMPLETED` and auto-launches `MainActivity` on TV power-up.

5. **Kiosk Screen Pinning (Dedicated Kiosk / Device Owner)**:
   - For dedicated commercial deployment where Home and Overview gestures must be locked at the OS level:
     ```powershell
     # Set device owner (must be run on unprovisioned device or before accounts are added; DO NOT run without owner approval):
     adb shell dpm set-device-owner com.viitor.kioskplayer/.DeviceAdminReceiver
     ```
   - Normal sideload installations use sticky immersive fullscreen with back-lock and boot auto-start, which does not require Device Owner.


## Logs & Diagnostics

- **Via `adb`**:
  ```powershell
  adb logcat -s RustStdoutStderr:I Chromium:I
  ```
- **Log file on device**: `/sdcard/Android/data/com.viitor.kioskplayer/files/` (or app-private `files/logs/kiosk.log`).
