# Kiosk Video Player - UI Text Comparison (Existing vs. Bold & Modern 75" Expo)

Generated from `UI_TEXT_PROOFREAD.md` for a 75" tech expo display.  
`{x}` = dynamic value filled in by the app.

---

## 1. App Name & Gallery (Home Screen)

| Element | Existing String | New String (Bold & Modern) | Notes |
|---|---|---|---|
| App name | Kiosk Video Player | Kiosk Video Player | Kept unchanged for system/installer consistency |
| Gallery heading | **Curated to Inspire** *(Inspire highlighted)* | **Built to Inspire** *(Inspire highlighted)* | Punchier and more tech-forward for a 75" booth display |
| Card title | `{filename without extension}` | `{filename without extension}` | Unchanged |
| Screen-reader labels | Previous page / Next page | Previous page / Next page | Unchanged |

---

## 2. Loading & Error Screens

| Element | Existing String | New String (Bold & Modern) | Notes |
|---|---|---|---|
| Loading | Preparing Media Library... | Loading Media... | Faster to scan on a large screen |
| Error title | Unable to Load Media | Media Unavailable | Cleaner, bolder headline |
| Error default reason | Failed to access media folder | Unable to access media folder | Unchanged/concise |
| Player-missing message | Selected video is no longer available | Video no longer available | Shorter for big-screen readability |
| Scanner error 1 | Failed to read media directory '{path}': {system message} | Could not read folder '{path}': {system message} | Slightly cleaner operator phrasing |
| Scanner error 2 | Folder has too many entries (limit {n}); scan truncated | Folder limit reached ({n} files max); scan truncated | Easier to scan quickly |

---

## 3. Empty & Permission Screens

| Situation | Existing Title | New Title | Existing Description | New Description |
|---|---|---|---|---|
| Android storage permission missing | Storage Permission Required | Storage Access Needed | Grant all-files access so Kiosk Video Player can read videos and thumbnails from external storage. | Allow all-files access so the player can load local videos and thumbnails. |
| No folder set | No Media Folder Configured | No Media Folder Set | Select a folder containing matching .mp4 videos and .png/.jpg/.jpeg thumbnails. | Choose a folder with matching .mp4 videos and .png/.jpg/.jpeg thumbnails. |
| Folder empty | Media Folder Is Empty | Media Folder Empty | Add matching `<name>.mp4` and `<name>.png` (or `.jpg`/`.jpeg`) pairs to the root of this folder. | Add matching `<name>.mp4` and `<name>.png`/`.jpg`/`.jpeg` files to the folder root. |
| Only videos | Thumbnails Missing | Thumbnails Missing | MP4 videos were found, but each video requires a matching .png, .jpg, or .jpeg thumbnail with the same filename. | Add a matching .png, .jpg, or .jpeg thumbnail for each .mp4 file. |
| Only images | Videos Missing | Videos Missing | Images were found, but each thumbnail requires a matching .mp4 video with the same filename. | Add a matching .mp4 video for each thumbnail image. |
| Nothing matches | No Matching Video Pairs | No Matching Pairs | Videos and images exist in this folder, but none share the same filename. | Rename matching video and thumbnail files so they share the exact same name. |

### Action Buttons (Empty & Error Screens)
| Existing String | New String |
|---|---|
| Grant file access | Grant Access |
| Select another folder | Select Folder |
| Retry | Retry |

---

## 4. Video Player & Error Overlay

| Element | Existing String | New String (Bold & Modern) |
|---|---|---|
| Top bar | Back, `{video title}` | Back, `{video title}` |
| Screen-reader labels | Resume playback, Back to gallery, Seek timeline, Pause, Play, Unmute, Mute, Volume, Enter fullscreen, Exit fullscreen | *(Keep unchanged for accessibility)* |
| Error message 1 | `Unable to play this video (code {n})` | `Playback error (code {n})` |
| Error message 2 | `Video failed to load within 10 seconds` | `Took over 10s to load` |
| Error message 3 | `Video playback stalled` | `Playback stalled` |
| Error button | Back to gallery | Back to Gallery |

---

## 5. Hidden Admin Panel (Long-press top-left corner for 2s)

| Element | Existing String | New String (Bold & Modern) |
|---|---|---|
| Title | ADMIN & SYSTEM DIAGNOSTICS | SYSTEM & KIOSK CONTROLS |
| Subtitle | Kiosk configuration, library integrity metrics, folder management, and hardware test playback. | Media folder setup, library health, and playback diagnostics. |
| Back button | Return to Gallery | Back to Gallery |
| Section 1 title | Media Root Directory | Media Root Directory |
| Section 1 buttons | Validate, Apply & Rescan, Browse System Folder, Force Rescan | Validate, Apply & Rescan, Browse Folder, Force Rescan |
| Android hint | Copy files to /storage/emulated/0/Kiosk/Media or configure KIOSK_MEDIA_ROOT in kiosk.env | Place media in /storage/emulated/0/Kiosk/Media or set KIOSK_MEDIA_ROOT in kiosk.env |
| Feedback messages | Media folder updated to: {path} / Path is valid: {path} / Invalid folder: {reason} / Library rescan complete. / Rescan failed: {reason} | *(Keep unchanged — clear & direct)* |
| Folder-change errors | Folder change already in progress / Media folder path cannot be empty / Invalid media folder: {reason} / Failed to persist media folder: {reason} / State machine refused SCAN_START transition / Media scan failed | *(Keep unchanged — technical operator logs)* |
| System folder messages | Media folder does not exist: {path} / Media path is not a directory: {path} / Media folder is not readable ({path}): {reason} | *(Keep unchanged)* |
| Section 2 title | Library Integrity & File Counts | Library Health & Counts |
| Section 2 labels | Playable Pairs, Ignored Orphans, Total Videos (.mp4), Total Images (PNG/JPG) | Playable Pairs, Unmatched Files, Total Videos (.mp4), Total Images (PNG/JPG) |
| Screensaver status | Screensaver.mp4 Present (Idle loop ready) / Screensaver.mp4 Missing (Fallback: Shuffle Slideshow) | Screensaver.mp4 Ready (Idle loop active) / Screensaver.mp4 Missing (Shuffle slideshow active) |
| Scan errors | Scan Errors ({n}): {list} | Scan Errors ({n}): {list} |
| Section 3 title | Test Video Playback | Playback Test |
| Section 3 labels | Screensaver.mp4 (Idle Video), No videos available, Play, Stop | Screensaver.mp4 (Idle Video), No videos available, Play, Stop |
| Section 3 helper | Select a video and tap Play to verify decode & sound | Select a clip and hit Play to test video & audio |
| Section 4 title | Device & Configuration Info | Device & Kiosk Config |
| Section 4 labels | Platform, Cards Per Page, Idle Timeout, Controls Auto-Hide, Slideshow Mode, Screensaver Sound, Sound Effects (SFX) | *(Keep unchanged)* |
| Exit button | Exit Kiosk Application | Exit Kiosk |
| Confirm dialog title | **Exit Kiosk Application?** | **Exit Kiosk Mode?** |
| Confirm dialog (Android) | Are you sure you want to exit Kiosk mode? This will stop kiosk lock and close the application to return to the Android launcher. | Exit kiosk lock and return to the Android home screen? |
| Confirm dialog (Desktop) | Are you sure you want to exit Kiosk mode and return to the system desktop? | Exit kiosk mode and return to the desktop? |
| Confirm buttons | Cancel / Yes, Exit App | Cancel / Exit Kiosk |

---

## 6. Settings File Keys (`kiosk.env`)
*(Unchanged — configuration keys)*  
`KIOSK_MEDIA_ROOT`, `IDLE_TIMEOUT_SECONDS`, `CONTROLS_AUTO_HIDE_SECONDS`, `SLIDESHOW_MODE` (`screensaver` | `shuffle` | `sequential`), `SCREENSAVER_SOUND`, `CARDS_PER_PAGE`, `SFX_ENABLED`, `RETURN_TO_GALLERY_ON_END`