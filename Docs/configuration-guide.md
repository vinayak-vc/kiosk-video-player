# Configuration Guide: Kiosk Video Player

## 1. Storage & Environment Configuration

The application configures its operational parameters through an environment file (`kiosk.env` or `.env`) located alongside the binary on desktop, or at `/sdcard/Kiosk/kiosk.env` on Android TV. Runtime folder selections made in the Admin Panel take priority and persist in the application's secure app-data storage (`config.json`).

### 1.1 Configuration Variables Reference

| Variable Name | Type | Default Value | Description |
|---------------|------|---------------|-------------|
| `KIOSK_MEDIA_ROOT` | string | `/sdcard/Kiosk/Media` (Android)<br>`C:/Kiosk/Media` (Windows) | Absolute path to the media folder containing video/thumbnail pairs. |
| `IDLE_TIMEOUT_SECONDS` | integer | `60` | Inactivity time before unattended kiosk transitions to Slideshow. |
| `CONTROLS_AUTO_HIDE_SECONDS` | integer | `4` | Seconds before player controls fade out while video is playing. |
| `SLIDESHOW_MODE` | string | `screensaver` | `screensaver` (plays Screensaver.mp4), `shuffle` (random bag), or `sequential` (natural order). |
| `SCREENSAVER_SOUND` | boolean | `true` | When true, Screensaver video plays audible; when false, muted. |
| `CARDS_PER_PAGE` | integer | `8` | Maximum cards per gallery page before pagination is triggered. |
| `SFX_ENABLED` | boolean | `true` | Enables/disables interactive Web Audio UI sound effects. |
| `RETURN_TO_GALLERY_ON_END` | boolean | `true` | When true, video completion returns to gallery; when false, pauses on final frame. |

---

## 2. Media Folder Organization & Naming Rules

To guarantee deterministic discovery by the scanner without database dependencies:

### 2.1 File Pairing Contract
1. **Valid Video Format**: `.mp4` only.
2. **Valid Thumbnail Formats**: `.png`, `.jpg`, `.jpeg`.
3. **Identical Basename**: The video and image must share the exact same basename before the extension (case-insensitive):
   - Example: `Adani - Centre of Excellence.mp4` + `Adani - Centre of Excellence.png`
4. **Thumbnail Priority**: If multiple thumbnails exist for the same video basename, priority is strictly:
   $$\text{PNG} > \text{JPG} > \text{JPEG}$$
5. **Natural Numerical Sorting**: Files sort naturally by numerical tokens:
   - Order: `1_Intro.mp4`, `2_Walk.mp4`, `10_Fly.mp4`, `11_Run.mp4` (not alphabetical `1`, `10`, `11`, `2`).
6. **Display Title**: Title is derived directly from the filename without extension (percent-decoded).
7. **Shallow Root Rule**: Subdirectories inside the media folder are ignored.

### 2.2 Reserved Screensaver File
- A file named `Screensaver.mp4` (with optional `Screensaver.png`) is reserved exclusively for the screensaver slideshow. It is automatically excluded from the gallery grid and orphan count.

### 2.3 Orphan Files
- Video files without a matching image thumbnail are ignored and tallied in `ignored_orphan_count`.
- Image files without a matching video file are ignored and tallied in `ignored_orphan_count`.
- Unsupported extensions (`.txt`, `.mpg`, `.mkv`, `.avi`) are ignored completely.

---

## 3. In-App Admin Panel Configuration

1. **Opening Admin Panel**: Long-press (2.0 seconds) the top-left corner of the screen, or press `Ctrl+Alt+S`.
2. **Selecting a New Media Folder**:
   - On Windows: Click **Browse** to open the native folder picker.
   - On Android: Enter the absolute path (e.g. `/sdcard/Kiosk/Media` or `/storage/XXXX-XXXX/Media` for USB drives) and click **Save & Rescan**.
3. **Saving Overrides**: Configuration changes persist across reboots in `config.json`.
