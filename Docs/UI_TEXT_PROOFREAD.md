# Kiosk Video Player - All on-screen text (for proofreading)

Generated from `src/renderer/src/strings.ts` and `src-tauri/src/media.rs` on 2026-11-27.
Aligned with `Docs/ui_strings_comparison_75_expo_edition.md`.
`{x}` = value filled in by the app. Technical log messages (kiosk.log) are not listed.

## App name
- Kiosk Video Player (window title, installer, Android app name, browser tab)

## Gallery (home screen)
- Heading: **Built to Inspire** ("Inspire" is the highlighted word)
- Card: video title = file name without extension; play badge (icon only)
- Buttons (screen-reader labels): Previous page / Next page
- Thumbnail fallback (when image fails): icon + title only

## Loading
- Loading Media...

## Empty / permission screens
| Situation | Title | Description |
|---|---|---|
| Android storage permission missing | Storage Access Needed | Allow all-files access so the player can load local videos and thumbnails. |
| No folder set | No Media Folder Set | Choose a folder with matching .mp4 videos and .png/.jpg/.jpeg thumbnails. |
| Folder empty | Media Folder Empty | Add matching <name>.mp4 and <name>.png/.jpg/.jpeg files to the folder root. |
| Only videos | Thumbnails Missing | Add a matching .png, .jpg, or .jpeg thumbnail for each .mp4 file. |
| Only images | Videos Missing | Add a matching .mp4 video for each thumbnail image. |
| Nothing matches | No Matching Pairs | Rename matching video and thumbnail files so they share the exact same name. |
- Buttons: Grant Access, Select Folder (desktop only), Retry

## Error screen
- Title: Media Unavailable
- Message: the reason ({reason}); default: Unable to access media folder
- Path box: {media folder path}
- Buttons: Select Folder (desktop only), Retry
- Player-missing case: Video no longer available
- Examples of reasons (from the scanner): Could not read folder '{path}': {system message} / Folder limit reached ({n} files max); scan truncated

## Video player
- Top bar: Back, then the video title
- Bottom bar: play/pause, time `{current} / {total}` (`--:--` if unknown), mute/unmute, volume slider, fullscreen (desktop only)
- Screen-reader labels: Resume playback, Back to gallery, Seek timeline, Pause, Play, Unmute, Mute, Volume, Enter fullscreen, Exit fullscreen
- Error overlay: {video title}; messages: `Playback error (code {n})`, `Took over 10s to load`, `Playback stalled`; button: Back to Gallery

## Screensaver
- No text on screen (video only). Tap anywhere to return.

## Hidden admin panel (long-press top-left corner for 2 s)
- Title: SYSTEM & KIOSK CONTROLS
- Subtitle: Media folder setup, library health, and playback diagnostics.
- Button: Back to Gallery
- Section **Media Root Directory**: Validate, Apply & Rescan, Browse Folder (desktop only), Force Rescan
  - Android hint: Place media in /storage/emulated/0/Kiosk/Media or set KIOSK_MEDIA_ROOT in kiosk.env
  - Feedback: Media folder updated to: {path} / Path is valid: {path} / Invalid folder: {reason} / Library rescan complete. / Rescan failed: {reason}
  - Folder-change errors: Folder change already in progress / Media folder path cannot be empty / Invalid media folder: {reason} / Failed to persist media folder: {reason} / State machine refused SCAN_START transition / Media scan failed
  - Folder messages from the system: Media folder does not exist: {path} / Media path is not a directory: {path} / Media folder is not readable ({path}): {reason}
- Section **Library Health & Counts**: Playable Pairs, Unmatched Files, Total Videos (.mp4), Total Images (PNG/JPG)
  - Screensaver.mp4 Ready (Idle loop active) / Screensaver.mp4 Missing (Shuffle slideshow active)
  - Scan Errors ({n}): {list}
- Section **Playback Test**: Screensaver.mp4 (Idle Video) in the list, No videos available, Play, Stop, Select a clip and hit Play to test video & audio
- Section **Device & Kiosk Config**: Platform, Cards Per Page, Idle Timeout, Controls Auto-Hide, Slideshow Mode, Screensaver Sound, Sound Effects (SFX)
- Button: Exit Kiosk
- Confirm dialog: **Exit Kiosk Mode?** - Android: "Exit kiosk lock and return to the Android home screen?" - Desktop: "Exit kiosk mode and return to the desktop?" - Buttons: Cancel, Exit Kiosk

## Settings file text (.env / kiosk.env keys)
KIOSK_MEDIA_ROOT, IDLE_TIMEOUT_SECONDS, CONTROLS_AUTO_HIDE_SECONDS, SLIDESHOW_MODE (screensaver | shuffle | sequential), SCREENSAVER_SOUND, CARDS_PER_PAGE, SFX_ENABLED, RETURN_TO_GALLERY_ON_END
