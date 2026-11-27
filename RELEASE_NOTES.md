# Kiosk Video Player — Release Notes (v1.0.1)

## Overview

**Kiosk Video Player** is a standalone, offline kiosk video playback application built with **Tauri v2**, **React 19**, **TypeScript**, **Zustand**, and **Framer Motion**, engineered for commercial touch displays (landscape 16:9, reference stage 1920×1080 scaled to physical 3840×2160 UHD) running Android TV 11+ / Android 14+.

Version **1.0.1** adds 32-bit ARM (`armeabi-v7a`) native binary support alongside 64-bit ARM (`arm64-v8a`) and x86_64 emulator support, specifically accommodating interactive touch panels such as the **Teachmint Interactive Panel** (Model C-T982-81-A62D, Android 11 / API 30, kernel 5.4.125), and lowers the frontend compiler target to **Chrome 80+ / ES2019** for older system WebViews.

---

## 1. What's New in v1.0.1

- **Tri-ABI Universal Android Binary**:
  - `arm64-v8a`: 64-bit ARM for modern Android TV 12+ and high-performance chipsets.
  - `armeabi-v7a`: 32-bit ARM for education/commercial touch panels (e.g., Teachmint C-T982-81-A62D on Android 11 with 32-bit userland).
  - `x86_64`: 64-bit x86 for developer workstation emulators.
  - *Verification note*: `armeabi-v7a` is cross-compiled with 32-bit integer/pointer validation and packaged as valid 32-bit ARM ELF binaries; runtime execution on physical 32-bit hardware is pending on-site panel staging.
- **Legacy WebView & CSS Compatibility (Chrome 80+ / ES2019)**:
  - Vite build target lowered to `['chrome80', 'es2019']` and `build.cssTarget: 'chrome80'`.
  - CSS transpilation expands `inset: 0` to cross-version `top: 0; right: 0; bottom: 0; left: 0;` across all screens.
  - Height fallbacks added for containers utilizing CSS `aspect-ratio` (supported natively from Chrome 88+).
  - Zero unsupported modern APIs (`structuredClone`, `Array.prototype.at`, `Object.hasOwn`).
- **Live WebView Engine Detection**:
  - Hardware Diagnostics probe and startup logger (`kiosk.log`) extract and display the exact Chrome/WebView version from `navigator.userAgent`.
- **Package Size**: Universal APK size increased to ~15.9 MB to package all three native `.so` runtime engines.

---

## 2. Core Features

- **Adaptive Gallery Grid**: Responsive 12-card pagination (4×3 on 75-inch TV) and 8-card (4×2) layout with glowing neon cinematic cards, high-contrast poster thumbnails, natural title sorting, and touch swipe / arrow navigation.
- **Strict Media Matching**: Automatically pairs `<basename>.mp4` videos with corresponding `<basename>.png` (or `.jpg` / `.jpeg`) thumbnails. Case-insensitive pairing, root folder only, orphans and unsupported files counted and cleanly ignored.
- **Cinematic Individual Player**: Seamless hero card-to-player zoom transition via Framer Motion layout animations. Custom touch-friendly controls (play/pause, touch-draggable timeline, elapsed/total time, volume slider, mute, fullscreen).
- **Exact Tap Contract**:
  - Controls hidden + tap blank video → reveal controls **and** toggle playback.
  - Controls visible + tap blank video → hide controls **and** toggle playback.
  - Tap on any control button/slider → acts only on that control (zero accidental hide/toggle).
  - Auto-hides controls after 4 seconds only while actively playing; paused state keeps controls visible.
- **Screensaver & Dual-Video Crossfade Slideshow**:
  - Dedicated screensaver support: placing `Screensaver.mp4` in the media folder loops seamlessly when the kiosk is idle without appearing as a gallery card.
  - Switchable slideshow modes: `screensaver`, `shuffle`, and `sequential`.
  - True A/B dual video element crossfade: next video preloads in the inactive slot (`preload="auto"`, `muted=true`), crossfading only after `canplay` readiness is achieved to prevent black frames or audio pops.
- **Robust Single State Machine**: Unified central transition table across 7 states (`INITIALIZING`, `SCANNING_MEDIA`, `GALLERY`, `INDIVIDUAL_PLAYER`, `SLIDESHOW`, `ADMIN_PANEL`, `ERROR`) with transition locks against rapid double-taps.
- **Hardware & Playback Diagnostics**: In-app probe that really loads and plays every clip in the media folder (resolution, duration, first-frame latency, dropped frames, a seek test, errors), lists which video codecs the device reports as supported, and writes the report to `diagnostics.txt`.
- **Android Kiosk Mode**:
  - Sticky immersive fullscreen hiding status bar and navigation pill.
  - Continuous `FLAG_KEEP_SCREEN_ON` wake-lock preventing panel sleep or dimming.
  - Hardware back button and edge gesture interception (`onBackPressedDispatcher`).
  - Auto-start on boot (`BOOT_COMPLETED` receiver).

---

## 3. Installation Instructions

### Option A: Automated ADB Installation (Recommended for Setup & Staging)
From a connected PC over ADB (USB or Wi-Fi):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-android.ps1
# Or via npm:
npm run android:install
```
This script automatically waits for the TV/panel, installs the release APK with `-r -d`, grants `MANAGE_EXTERNAL_STORAGE` permission, creates `/sdcard/Kiosk/Media`, pushes sample media, and launches the player.

### Option B: Sideload via USB Flash Drive / TV File Manager (No ADB Required)
1. Copy `kiosk-video-player-v1.0.1.apk` onto a USB flash drive.
2. Insert the flash drive into the Android TV / Teachmint panel.
3. Open the TV's **File Manager** (e.g., FX File Explorer or built-in File Manager) and tap the APK to install.
   - If prompted, permit "Install unknown apps" for the file manager.
4. Launch **Kiosk Video Player**.
5. On initial launch, when prompted with "Grant file access", tap the button to enable **Allow access to manage all files** in Android Settings, then press the TV remote's Back button to return to the app.

---

## 4. Media Folder, Screensaver & Configuration

### Media Placement
- **Android Target**: `/sdcard/Kiosk/Media/` (canonical `/storage/emulated/0/Kiosk/Media/`)
- **Windows Dev/Fallback**: `C:\Kiosk\Media\`
- File format requirements:
  - `<Title>.mp4` + `<Title>.png` (or `.jpg`, `.jpeg`).
  - Thumbnail priority: `.png` > `.jpg` > `.jpeg`.
  - All files must reside in the root of the media folder (subdirectories are ignored).
  - **Screensaver**: Place `Screensaver.mp4` (case-insensitive) in the media folder. It will loop automatically during kiosk idle and will not appear in the gallery.

### Optional Configuration Overrides (`kiosk.env`)
Place an optional plain text `kiosk.env` file at `/sdcard/Kiosk/kiosk.env` (or beside the Windows binary) to override defaults:
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

---

## 5. Admin Panel Access & Hardware Diagnostics

### Opening the Admin Panel
- **Touch Gesture (75" TV / Panel)**: Press and hold the top-left 120×120 px corner of the display for **2 seconds**.
- **Keyboard / Dev**: Press `Ctrl + Alt + S`.

### Admin Features & Diagnostics
- **Live Folder Health**: Displays validated media folder, active item counts, orphan counts, and screensaver status.
- **Hardware & Playback Diagnostics**:
  - Tap **Run Diagnostics**. It probes every clip one after another and shows the report on screen.
  - The report is saved automatically next to the media folder (the folder above it):
    - Android: `/sdcard/Kiosk/diagnostics.txt` (default media folder).
    - Windows: the parent of the media folder, e.g. `C:\Kiosk\diagnostics.txt`.
  - It contains device/WebView info, display size and density, codec support, per-clip results and a verdict computed from them. Please send this file back after the first run on the TV.
- **Test Playback**: Built-in test video player inside the Admin Panel to verify video decoding and sound independently of the gallery.
- **Kiosk Exit**: Protected button to gracefully exit the application.

---

## 6. Known Limitations & Target Hardware Notice

The application has been extensively tested with 151 unit/integration tests, 4 Playwright E2E suites, and a 30-minute continuous emulator native memory soak (+2.1 MiB/29 min). However, the following items remain **unverified on physical Teachmint panel hardware** and require on-site validation upon staging:
1. **Physical Panel Playback**: 4K UHD 60fps / H.265 hardware video decoding depends on the specific panel chipset and media decoder implementation. Staging verification is required using the Admin Diagnostics probe.
2. **32-bit ARM (armeabi-v7a) Device Execution**: The 32-bit binary is compiled and packaged in the release APK, but the local emulator environment is x86_64. Physical 32-bit execution verification is pending on-site deployment.
3. **Android System WebView Version**: Build targets Chrome 80+ with CSS/JS fallbacks, unverified on the physical Teachmint panel until sideload. If an extremely old WebView (< Chrome 80) is encountered, updating the Android System WebView package via APK sideload is recommended.
4. **Boot Auto-Start**: While `BOOT_COMPLETED` receiver is registered, TV manufacturer firmware (e.g., custom launcher skins, power-saving policies) may restrict background auto-launch without setting the app as default launcher or configuring manufacturer autostart settings.
5. **Physical Touch Responsiveness & Multi-Touch**: Multi-touch and palm rejection algorithms have been implemented, but final touch latency and tactile feel must be verified on the physical IR/capacitive touch overlay.
6. **Multi-Day Memory Soak**: Soak test verified flat memory stability for 30 minutes (+2.09 MB PSS) on the emulator; multi-day continuous stress testing on the real panel remains pending.
7. **Windows Packaged Installer**: Desktop Windows NSIS packaging (card BT-29) was paused per Lead instruction to focus strictly on Android-first touch panel deliverables.
