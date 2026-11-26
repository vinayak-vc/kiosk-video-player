# Kiosk Video Player — Android Sideload & Test Guide (M1)

This folder contains the stripped, debug-key-signed Universal APK (`arm64-v8a` + `x86_64`) for sideload testing on the 75-inch touch Android TV.

## Option A: Install without `adb` (USB Stick / File Manager)

1. Copy `kiosk-player-test-*.apk` onto a USB flash drive (or into the TV's `Downloads` folder).
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

## Logs & Diagnostics

- **Via `adb`**:
  ```powershell
  adb logcat -s RustStdoutStderr:I Chromium:I
  ```
- **Log file on device**: `/sdcard/Android/data/com.viitor.kioskplayer/files/` (or app-private `files/logs/kiosk.log`).
