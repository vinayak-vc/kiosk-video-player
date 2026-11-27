# Kiosk Video Player — Windows Installation & Deployment Guide (v1.0.2 x64 Release)

This directory contains the production NSIS x64 standalone installer for 64-bit Windows 10/11 kiosk installations.

## Build Information
- **File**: `kiosk-video-player-v1.0.2-x64-setup.exe`
- **Version**: 1.0.2
- **Platform**: Windows x64 (10/11)
- **Size**: 1,661,107 bytes (1.58 MB)
- **Built**: 2026-11-27
- **SHA-256**: `f03e045bcbcd76ea057de8a0f2c23ff057c3c9d4eacee284542269ffcafe5bc8`
- **Checksum file**: `kiosk-video-player-v1.0.2-x64-setup.exe.sha256`

---

## Windows SmartScreen Warning (Unsigned Installer)

> [!NOTE]
> This installer is built for offline enterprise kiosks and is not signed with an expensive commercial EV (Extended Validation) code-signing certificate.
> 
> When running the installer, Windows Defender SmartScreen may display:
> **"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."**
> 
> To proceed:
> 1. Click **More info**.
> 2. Click **Run anyway**.
> 3. Verify the SHA-256 checksum against `kiosk-video-player-v1.0.1-x64-setup.exe.sha256` to confirm binary integrity.

---

## Installation Options

### Option 1: Standard Interactive Installation (GUI)
1. Double-click `kiosk-video-player-v1.0.1-x64-setup.exe`.
2. Follow the NSIS setup wizard prompts.
3. By default, the application installs to `%LOCALAPPDATA%\Programs\Kiosk Video Player\` and creates a Desktop shortcut and Start Menu entry.

### Option 2: Silent Automated Installation (Command Line / Kiosk Provisioning)
To install unattended without UI prompts:
```powershell
.\kiosk-video-player-v1.0.1-x64-setup.exe /S
```

---

## Media Folder Setup

- **Default Media Folder**: `C:\Kiosk\Media\`
- The app scans the root of this folder on startup for video/image pairs:
  - `<basename>.mp4` + `<basename>.png` (or `.jpg` / `.jpeg`)
- **Screensaver Video**: Place `Screensaver.mp4` (case-insensitive) in `C:\Kiosk\Media\`. It is automatically reserved for the idle slideshow screensaver loop and omitted from the gallery cards.
- **Fallback sample media**: If `C:\Kiosk\Media\` does not exist or is empty, the application falls back to sample media or displays an intuitive empty-state screen directing the operator to configure the folder in the Admin Panel.

---

## Configuration & Environment Overrides

The application supports three levels of configuration resolution:
1. **Admin Panel Override (Highest Priority)**: Configured in the Admin Panel and persisted as JSON in `%APPDATA%\com.viitor.kioskplayer\config.json`.
2. **Environment File (Middle Priority)**: A `.env` or `kiosk.env` file placed directly beside `kiosk-video-player.exe` in the installation directory (`%LOCALAPPDATA%\Programs\Kiosk Video Player\.env` or `%LOCALAPPDATA%\Kiosk Video Player\.env`).
3. **Application Defaults (Fallback)**:
   - `KIOSK_MEDIA_ROOT=C:\Kiosk\Media`
   - `IDLE_TIMEOUT_SECONDS=60`
   - `CONTROLS_AUTO_HIDE_SECONDS=4`
   - `SLIDESHOW_MODE=screensaver`
   - `SCREENSAVER_SOUND=false`
   - `SFX_ENABLED=true`
   - `CARDS_PER_PAGE=12`

---

## Kiosk Controls & Operations

- **Fullscreen & Lock-down**: The app launches in borderless exclusive fullscreen mode with right-click context menu, devtools, and window dragging disabled.
- **Exit Kiosk**: Press **`Ctrl + Alt + Q`** to cleanly close the application (`Escape` is intercepted and blocked).
- **Open Admin Panel**:
  - Keyboard: Press **`Ctrl + Alt + S`**
  - Touchscreen: Long-press (2 seconds) on the invisible hotspot in the **top-left corner**.
- **Admin Password**: Default is `admin` (configurable via `.env`).
- **Diagnostics**: Inside the Admin Panel, click **Run Diagnostics** to perform hardware-accelerated video decode probes. The report is saved to `C:\Kiosk\diagnostics.txt`.

---

## Uninstallation

To uninstall:
1. Open Windows **Settings > Apps > Installed apps** (or **Add or remove programs**).
2. Locate **Kiosk Video Player** and click **Uninstall**.
3. Or run the uninstaller directly:
   ```powershell
   & "$env:LOCALAPPDATA\Programs\Kiosk Video Player\Uninstall Kiosk Video Player.exe" /S
   ```
