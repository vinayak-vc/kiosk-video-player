# Android 75-Inch TV Deployment, Provisioning & Kiosk Lock-Down Guide (A9 / BT-39)

This comprehensive guide covers toolchain setup, compilation, sideloading, storage provisioning, kiosk lock-down, administrative gestures, and troubleshooting for the 75-inch Android Touch TV installation.

---

## 1. Quick Start / Installation via ADB

If you have an Android TV or tablet connected via USB / Wi-Fi with USB Debugging enabled:

```powershell
# Automated one-step device provisioning and release installation:
npm run android:install
```

This automated script (`scripts/install-android.ps1`):
1. Detects the connected device via `adb devices`.
2. Cleanly uninstalls any conflicting signature versions.
3. Installs `android-out/kiosk-player-v1.0.0-release.apk`.
4. Grants `MANAGE_EXTERNAL_STORAGE` permission automatically (`appops set com.viitor.kioskplayer MANAGE_EXTERNAL_STORAGE allow`).
5. Creates `/sdcard/Kiosk/Media` and pushes Futurotec sample media.
6. Launches the application in immersive fullscreen mode.

---

## 2. Toolchain Setup & Compilation

### 2.1 Requirements
- **JDK 17**: Set `JAVA_HOME` pointing to JDK 17 (Microsoft OpenJDK or Eclipse Adoptium).
- **Android SDK & NDK**:
  - `ANDROID_HOME`: e.g. `%LOCALAPPDATA%\Android\Sdk`
  - `NDK 27.x`: `%LOCALAPPDATA%\Android\Sdk\ndk\27.2.12479018`
- **Rust Targets**:
  ```powershell
  rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
  ```

### 2.2 Generating Release Keystore
The keystore is generated outside the repository in the user's home directory (`~/.android/kiosk-release.keystore`):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-keystore.ps1
```

### 2.3 Building Universal Release APK
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android-build.ps1 -Release
```
Output artifact: `android-out/kiosk-player-v1.0.0-release.apk` (11.1 MB, SHA-256 verified, signed with Release cert).

---

## 3. Media Provisioning & File Copying

The default media root on Android is:
```
/sdcard/Kiosk/Media
(also accessible as /storage/emulated/0/Kiosk/Media)
```

### 3.1 Option A: USB Drive (Field Deployment)
1. Format a USB 3.0 flash drive as **FAT32** or **exFAT**.
2. Create a folder named `Media` on the root of the USB drive.
3. Copy your `.mp4` video files and matching `.png`/`.jpg` thumbnails into the `Media` folder.
4. Plug the USB drive into the 75-inch TV's USB port.
5. In the app's Admin Panel, change the media path to the USB mount point (e.g. `/storage/XXXX-XXXX/Media`).

### 3.2 Option B: ADB Push (Over Network or Cable)
```powershell
# Create directory
adb shell mkdir -p /sdcard/Kiosk/Media

# Push media folder
adb push "C:\React\Videos\Futurotec_Videos\Futurotec_Videos\." /sdcard/Kiosk/Media/
```

### 3.3 Option C: On-Device File Manager
Use a TV file manager app (e.g. AnExplorer or FX File Explorer) to copy media files from local network storage or Google Drive into `/sdcard/Kiosk/Media`.

---

## 4. Storage Permissions (All-Files Access)

The app targets Android 14 (`targetSdkVersion 34`) and requires `MANAGE_EXTERNAL_STORAGE` to discover files in public shared storage.

### Method 1: Automatic via ADB (Recommended)
```powershell
adb shell appops set com.viitor.kioskplayer MANAGE_EXTERNAL_STORAGE allow
```

### Method 2: Manual via TV Settings
1. On the TV, go to **Settings** > **Apps** > **Special App Access** > **All Files Access**.
2. Locate **Kiosk Video Player** and toggle **Allow access to manage all files** to **ON**.
3. When returning to the app, the storage permission gate clears automatically.

---

## 5. Provisioning a 75-Inch Android TV for Unattended Kiosk Operation

To ensure the 75-inch touch screen operates continuously 24/7 without public visitors accessing the underlying Android TV launcher:

### 5.1 Screen Pinning (App Pinning)
1. On the TV, open **Settings** > **Security & Restrictions** > **Screen Pinning** and turn it **ON**.
2. Open **Kiosk Video Player**.
3. Open the recent apps overview (or use `adb shell am task lock <taskId>`).
4. Select the pin icon to lock the screen to the player.
5. When pinned, the Home and Back buttons cannot leave the player without an administrative PIN.

### 5.2 Device Owner / Full Kiosk Lock-down (MDM / Enterprise Mode)
For complete lock-down where system bars and notifications are disabled:
```powershell
# Set Device Owner (requires factory reset device or no existing accounts):
adb shell dpm set-device-owner com.viitor.kioskplayer/.DeviceAdminReceiver
```

### 5.3 Prevent Screen Sleep & Auto-Power
1. In **Settings** > **Device Preferences** > **Display & Sound** > **Screen Saver**: set to **Never**.
2. In **Settings** > **Device Preferences** > **Energy Saver**: set **Turn off display** to **Never**.
3. In Developer Options (`Settings > About > tap Build Number 7 times`):
   - Enable **Stay Awake** (screen never sleeps while charging/powered).
4. For TVs with scheduled auto-power on/off: configure the TV's hardware timer to power on at 08:00 AM daily.

### 5.4 Auto-Start on Boot
The application manifest registers `RECEIVE_BOOT_COMPLETED`. Upon system startup, the app automatically initializes and launches into the Gallery screen without operator intervention.

> [!NOTE] Hardware Verification Status
> Auto-start on boot is implemented via `RECEIVE_BOOT_COMPLETED` and verified on the Android emulator. On the physical 75-inch Android TV hardware, manufacturers often apply aggressive background execution limits or custom OEM launch permissions. Boot-start and hardware 4K video playback remain **UNVERIFIED on the target TV hardware** until confirmed on-site using the built-in Admin Panel Hardware & Playback Diagnostics tool (which generates `/sdcard/Kiosk/diagnostics.txt`).

---

## 6. Administrative Access & Maintenance Gestures

1. **Top-Left Touch Hotspot**:
   - Location: Top-left `120 × 120 px` square of the screen.
   - Action: Press and hold continuously for **2.0 seconds**.
   - Result: Opens the Admin Panel.
2. **Keyboard Shortcut**:
   - If an external keyboard or remote is connected: press `Ctrl + Alt + S`.
3. **Exit App**:
   - Inside the Admin Panel, click **Exit Application** and confirm in the safety modal (or press `Ctrl + Alt + Q`).

---

## 7. Troubleshooting Matrix

| Issue | Root Cause | Solution |
|-------|------------|----------|
| **"Storage Access Required" Screen** | `MANAGE_EXTERNAL_STORAGE` permission has not been granted. | Run `adb shell appops set com.viitor.kioskplayer MANAGE_EXTERNAL_STORAGE allow` or enable in TV Special App Access settings. |
| **"Media Unavailable: 0 pairs discovered"** | Files do not have matching basenames or are placed in subdirectories. | Ensure each `.mp4` has an identically named `.png` or `.jpg` in the root of `/sdcard/Kiosk/Media`. Subdirectories are ignored. |
| **Video Playback Error (code 4)** | Video codec or profile is unsupported by hardware decoder. | Encode video in standard H.264 High Profile (`libx264`, `yuv420p`, AAC audio). Run built-in Admin Diagnostics to check codec support. |
| **Playback Stalls / Freezes** | Video decoder memory exhaustion or corrupt media bitstream. | The player's 15s Stall Watchdog will automatically display an error overlay. Check `diagnostics.txt` or reboot the TV. |
| **Black Screen on Touch** | Missing thumbnail or uninitialized `<video>` poster. | Verified resolved in v1.0.0; ensure thumbnails are valid PNG/JPG images. |
| **Checking Application Logs** | Diagnostics or debug information needed from the field. | Read `/sdcard/Kiosk/diagnostics.txt` exported from Admin Panel, or stream logcat via: `adb logcat -s KioskVideoPlayer:V chromium:E`. |
