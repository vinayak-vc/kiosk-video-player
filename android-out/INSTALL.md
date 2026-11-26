# Kiosk Video Player — Android Sideload & Test Guide (M1)

This folder contains the stripped, debug-key-signed Universal APK (`arm64-v8a` + `x86_64`) for sideload testing on the 75-inch touch Android TV.

## Build Information
- **File**: `kiosk-player-test-2026-11-26.apk`
- **Size**: 11,594,543 bytes (11.06 MB)
- **Built**: 2026-11-27 00:15 IST (from git HEAD with A6 Kiosk Mode)
- **SHA-256**: `ee9da16d5a2bfadf1157bb40ae18dd1b5b8c671eda51e06e81d75e861130e849`
- **Architectures**: `arm64-v8a`, `x86_64`

## Option A: Install without `adb` (USB Stick / File Manager)

1. Copy `kiosk-player-test-2026-11-26.apk` onto a USB flash drive (or into the TV's `Downloads` folder).
2. Plug the USB drive into the Android TV and open the TV's **File Manager** app.
3. Tap the `.apk` file to install.
   - If prompted, open **Settings -> Install unknown apps** and enable permission for your File Manager.
4. Launch **Kiosk Video Player**.
5. On first launch, tap **Grant file access** -> enable **Allow access to manage all files** for **Kiosk Video Player**, then press **Back** to return to the app.

## Option B: Install via `adb`

```powershell
adb install -r kiosk-player-test-2026-11-26.apk
# Optional: grant all-files access via adb instead of the Settings UI
adb shell appops set com.viitor.kioskplayer MANAGE_EXTERNAL_STORAGE allow
adb shell am start -n com.viitor.kioskplayer/.MainActivity
```

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
