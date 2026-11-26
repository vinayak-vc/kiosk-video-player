# Kiosk Video Player - All on-screen text (for proofreading)

Generated from the source on 2026-11-27. Tell us the exact corrections and we will apply them.
`{x}` = value filled in by the app. Technical log messages (kiosk.log) are not listed.

## App name
- Kiosk Video Player (window title, installer, Android app name, browser tab)

## Gallery (home screen)
- Heading: **Curated to Inspire**  (changed from "Explore Our Amazing Content"; "Inspire" is the highlighted word)
- Card: video title = file name without extension; play badge (icon only)
- Buttons (screen-reader labels): Previous page / Next page
- Thumbnail fallback (when image fails): icon + title only

## Loading
- Preparing Media Library...

## Empty / permission screens
| Situation | Title | Description |
|---|---|---|
| Android storage permission missing | Storage Permission Required | Grant all-files access so Kiosk Video Player can read videos and thumbnails from external storage. |
| No folder set | No Media Folder Configured | Select a folder containing matching .mp4 videos and .png/.jpg/.jpeg thumbnails. |
| Folder empty | Media Folder Is Empty | Add matching <name>.mp4 and <name>.png (or .jpg/.jpeg) pairs to the root of this folder. |
| Only videos | Thumbnails Missing | MP4 videos were found, but each video requires a matching .png, .jpg, or .jpeg thumbnail with the same filename. |
| Only images | Videos Missing | Images were found, but each thumbnail requires a matching .mp4 video with the same filename. |
| Nothing matches | No Matching Video Pairs | Videos and images exist in this folder, but none share the same filename. |
- Buttons: Grant file access, Select another folder (desktop only), Retry

## Error screen
- Title: Unable to Load Media
- Message: the reason ({reason}); default: Failed to access media folder
- Path box: {media folder path}
- Buttons: Select another folder (desktop only), Retry
- Player-missing case: Selected video is no longer available
- Examples of reasons (from the scanner): Failed to read media directory '{path}': {system message} / Folder has too many entries (limit {n}); scan truncated

## Video player
- Top bar: Back, then the video title
- Bottom bar: play/pause, time `{current} / {total}` (`--:--` if unknown), mute/unmute, volume slider, fullscreen (desktop only)
- Screen-reader labels: Resume playback, Back to gallery, Seek timeline, Pause, Play, Unmute, Mute, Volume, Enter fullscreen, Exit fullscreen
- Error overlay: {video title}; messages: `Unable to play this video (code {n})`, `Video failed to load within 10 seconds`, `Video playback stalled`; button: Back to gallery

## Screensaver
- No text on screen (video only). Tap anywhere to return.

## Hidden admin panel (long-press top-left corner for 2 s)
- Title: ADMIN & SYSTEM DIAGNOSTICS
- Subtitle: Kiosk configuration, library integrity metrics, folder management, and hardware test playback.
- Button: Return to Gallery
- Section **Media Root Directory**: Validate, Apply & Rescan, Browse System Folder (desktop only), Force Rescan
  - Android hint: Copy files to /storage/emulated/0/Kiosk/Media or configure KIOSK_MEDIA_ROOT in kiosk.env
  - Feedback: Media folder updated to: {path} / Path is valid: {path} / Invalid folder: {reason} / Library rescan complete. / Rescan failed: {reason}
  - Folder-change errors: Folder change already in progress / Media folder path cannot be empty / Invalid media folder: {reason} / Failed to persist media folder: {reason} / State machine refused SCAN_START transition / Media scan failed
  - Folder messages from the system: Media folder does not exist: {path} / Media path is not a directory: {path} / Media folder is not readable ({path}): {reason}
- Section **Library Integrity & File Counts**: Playable Pairs, Ignored Orphans, Total Videos (.mp4), Total Images (PNG/JPG)
  - Screensaver.mp4 Present (Idle loop ready) / Screensaver.mp4 Missing (Fallback: Shuffle Slideshow)
  - Scan Errors ({n}): {list}
- Section **Test Video Playback**: Screensaver.mp4 (Idle Video) in the list, No videos available, Play, Stop, Select a video and tap Play to verify decode & sound
- Section **Device & Configuration Info**: Platform, Cards Per Page, Idle Timeout, Controls Auto-Hide, Slideshow Mode, Screensaver Sound, Sound Effects (SFX)
- Button: Exit Kiosk Application
- Confirm dialog: **Exit Kiosk Application?** - Android: "Are you sure you want to exit Kiosk mode? This will stop kiosk lock and close the application to return to the Android launcher." - Desktop: "Are you sure you want to exit Kiosk mode and return to the system desktop?" - Buttons: Cancel, Yes, Exit App

## Settings file text (.env / kiosk.env keys)
KIOSK_MEDIA_ROOT, IDLE_TIMEOUT_SECONDS, CONTROLS_AUTO_HIDE_SECONDS, SLIDESHOW_MODE (screensaver | shuffle | sequential), SCREENSAVER_SOUND, CARDS_PER_PAGE, SFX_ENABLED, RETURN_TO_GALLERY_ON_END
