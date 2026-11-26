# Project Overview: Kiosk Video Player

## 1. Executive Summary

**Kiosk Video Player** is a standalone, offline, touch-first video kiosk application engineered specifically for **75-inch 4K Android Touch Displays** (and paused Windows x64 desktop support). Designed for public exhibitions, corporate experience centers, and trade shows, the player delivers a reliable, cinematic video showcase with zero reliance on cloud services, external CDNs, or network connectivity.

- **Primary Deployment Target**: 75-inch Android TV / Android 14+ Touch Display (3840×2160 physical resolution).
- **Secondary / Legacy Target**: Windows 10/11 x64 (desktop kiosk engine currently paused per Android pivot).
- **Architecture**: Tauri v2 + Rust Core + React 19 + TypeScript + Zustand + Framer Motion.

---

## 2. Core User Experience

The application is structured around three primary presentation states and one hidden maintenance surface:

```
                  ┌────────────────┐
                  │  INITIALIZING  │
                  └───────┬────────┘
                          │ (Media Scan OK)
                          ▼
             ┌─────────────────────────┐
             │         GALLERY         │◄────────────────┐
             └──────┬─────────────▲────┘                 │
   (Card Tap)       │             │ (Back / Ended)       │ (Tap Anywhere)
                    ▼             │                      │
             ┌──────────────┐     │              ┌───────┴──────┐
             │  INDIVIDUAL  ├─────┘              │  SLIDESHOW   │
             │    PLAYER    │                    │ (Screensaver)│
             └──────────────┘                    └───────▲──────┘
                                                         │
                                                         │ (Idle Timeout)
                                                 [Any Unattended Screen]
```

### 2.1 The Gallery Screen
- **Grid Layout**: Dynamically centered, balanced grid computed for 1 to 24 cards without overflow.
- **Pagination**: Paginated navigation when items exceed configured `cards_per_page` (default: 8 or 12).
- **Touch Navigation**: Large touch targets (minimum 60×60px at 1080p, 120×120px at 4K) with smooth horizontal touch-swiping between pages.
- **Hero Motion**: Tapping a card initiates a shared layout hero transition expanding the thumbnail directly into the video player without flashing or black frames.

### 2.2 The Individual Player
- **Tap Contract**:
  - Tapping the video surface while controls are hidden: reveals the controls and pauses playback.
  - Tapping the video surface while controls are visible: hides the controls and resumes playback.
  - Tapping a control button (Play/Pause, Timeline, Mute, Fullscreen, Back): executes that control action without bubbling or toggling visibility.
- **Auto-Hide**: Controls automatically fade out after `controls_auto_hide_seconds` (default: 4s) only while actively playing. When paused, controls remain visible indefinitely.
- **Completion**: When the video finishes, it automatically returns to the Gallery (reseting the idle timer) when `return_to_gallery_on_end` is true.

### 2.3 The Auto Slideshow / Screensaver
- **Idle Activation**: Triggered after `idle_timeout_seconds` of unattended activity.
- **Dual-Video Preload Buffer**: Utilizes two HTML5 `<video>` elements (Slot A and Slot B) for seamless crossfading. While track A plays audible, track B preloads muted in the background. On track completion, track B crossfades in while track A releases hardware resources cleanly.
- **Play Modes**:
  - `screensaver`: Dedicated looping `Screensaver.mp4`.
  - `shuffle`: Shuffle-bag cycling through all gallery videos with no consecutive repeats (unless 1 item).
  - `sequential`: Deterministic natural-order playback cycling.
- **Instant Escape**: A single touch anywhere immediately dismisses the slideshow and restores the Gallery.

### 2.4 The Hidden Admin Panel
- **Access Gestures**: Long-pressing the top-left 120×120px hotspot for 2.0 seconds, or pressing `Ctrl+Alt+S` on an attached keyboard.
- **Diagnostics**: Real-time hardware codec probing, dropped frame monitoring via `getVideoPlaybackQuality()`, and atomic export to `<parent>/diagnostics.txt`.
- **Runtime Overrides**: Live adjustment of idle timeout, auto-hide delay, cards per page, slideshow mode, sound, and media folder path.
