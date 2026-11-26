# Project Brief — Animated Windows Kiosk Video Player (owner requirements)

Standalone Windows desktop app (NOT a website), fullscreen on a 16:9 touchscreen kiosk. Implement everything: UI, animations, playback, filesystem scanning, matching, slideshow, SFX, configuration, Windows packaging. Implement in the repo; do not stop at plans. See `LEAD_PLAN.md` for the Tauri mapping of Electron-flavoured wording below.

## 1. Stack
Tauri (desktop), React, TypeScript, Vite, Framer Motion, HTML5 Video, Zustand, Lucide React, CSS Modules (or organised global CSS), Tauri bundler for Windows. Backend (Rust) does filesystem + native Windows work. Restricted bridge API for scanning, folder selection, config, app events. Validate all IPC inputs. No CDN assets; fully offline after install. Target Windows 10/11 x64. Security: no unrestricted system APIs exposed to React.

## 2. Concept
Screens: Media Gallery, Individual Video Player, Automatic Slideshow, plus hidden admin/config UI. 16:9 composition, design resolution 1920x1080, must scale to 1280x720, 1920x1080, 2560x1440, 3840x2160 and use the entire display. No browser UI, borders, address bar, devtools.

## 3. Visual direction
Mockup: `Docs/mockup/a_polished_ui_ux_design_board_layout_kiosk_app_mo.png` — recreate the visual language. Premium cinematic, deep navy/black, electric blue + violet + subtle cyan, gradients, subtle light, rounded cards with thin glowing borders, soft depth, smooth entrance/exit, cinematic transitions, clear typography, large touch controls. Museum-kiosk feel, not a file browser/basic player. Animations enhance, never distract. GPU-friendly only: opacity, transform, scale, translate, controlled blur. No expensive continuous animation.

## 4. Media folder configuration
Default root from env file. `.env.example`:
```
KIOSK_MEDIA_ROOT=C:/Kiosk/Media
IDLE_TIMEOUT_SECONDS=60
CONTROLS_AUTO_HIDE_SECONDS=4
SLIDESHOW_MODE=shuffle
CARDS_PER_PAGE=8
SFX_ENABLED=true
RETURN_TO_GALLERY_ON_END=true
```
Loaded in the backend. Packaged builds read an editable `.env` beside the exe (install dir may be non-writable). In-app folder selection too. Priority: 1) folder chosen in admin UI, 2) `.env` default. Persist chosen folder in a separate user-data config file; never modify the packaged `.env`. Startup: read config → resolve root → verify exists/accessible → scan → build pairs → show gallery. Invalid path → beautiful config/error screen with "select another folder". Never fail silently.

## 5. Discovery and pair matching (important)
Root folder only (no subdirectories initially). Example: 1.mp4+1.png, 2.mp4+2.jpeg, 3.mp4+3.jpg valid; 5.mp4 (no image), 6.png (no video), 7.mp4 (no image) ignored.
- Video needs image with exact same basename, **case-insensitive**. Only `.mp4` videos now; images `.png .jpg .jpeg`. Orphan video/image ignored, unsupported files ignored, directories not media. Extension lists isolated for future formats. `.mpg` is a video format, never an image extension.
- Scanner returns: ID, filename, display title, video path, thumbnail path, video URL, thumbnail URL, file size.
- Title = filename without extension (`Space Exploration.mp4` → `Space Exploration`). Never invent titles.
- Multiple thumbnails for one basename: PNG > JPG > JPEG.
- **Natural sort** (1,2,3,10,11 — not 1,10,11,2,3).
- Gallery shows only valid pairs. Scanner is a dedicated service with unit tests. Debounced filesystem watcher reflects add/remove while running.

## 6. Screen 1 — Gallery
Full 16:9. Cinematic background, heading/brand title, grid of cards (thumbnail `object-fit: cover`, filename title), page navigation, page indicators, optional subtle background ambience. Large touch hit areas, subtle glowing borders, hover for mouse, touch must not rely on hover.
Layout: 4 columns x 2 rows (8 per page), scale for smaller displays, centre fewer cards, paginate beyond 8, touch swipe changes pages, prev/next controls + animated indicators.
Animations: staggered entrance with subtle scale+opacity; slight ambient glow (not all cards moving continuously); hover → slight scale, brighter border, glow; press → scale down, tap sound, selection animation; select → thumbnail expands/zooms into cinematic transition to the player (no abrupt swap). Use Framer Motion shared-layout where appropriate.

## 7. Screen 2 — Player
Tap card → start video, transition to fullscreen player, controls hidden by default, play with sound, keep aspect ratio (black letterbox, no stretch/crop), fill display.
Controls: play/pause, seek/timeline, current time, duration, volume, mute/unmute, fullscreen, centre play/pause indicator when paused. Large touch targets, semi-transparent dark premium style. Hidden initially; reveal/hide via fade + slight vertical movement; never abrupt.
**Tap contract:**
- Controls hidden: single tap on blank video surface reveals controls AND toggles play→pause.
- Controls visible: single tap on blank surface toggles playback AND hides controls (paused→playing, controls disappear).
- Tap on an actual control: only that control's action; must not bubble to the surface handler; play/pause button toggles playback without an extra visibility toggle.
- Timeline supports touch drag. Never trigger playback twice from touch+mouse compatibility events.
- Auto-hide delay configurable (default 4 s). While paused, controls stay visible until resume or explicit hide. While playing with no interaction, auto-hide after delay.
End of video: fade out player, return to gallery, subtle transition sound, cards animate back, reset gallery idle timer. Setting `RETURN_TO_GALLERY_ON_END=true`.
Playback failure: clean error overlay, log the error, way back to gallery, never a permanent black screen.

## 8. Screen 3 — Slideshow
After inactivity (default 60 s, configurable) enter slideshow. Idle timer starts when gallery visible, resets on gallery interaction. An individually playing video is never interrupted by idle slideshow; a paused-and-abandoned video may time out to slideshow. Reset/cancel timers correctly on every transition; never two idle timers.
Entering: fade out gallery, auto-start a video, hide all controls, fullscreen, on end auto-play another, indefinitely until interaction. All valid pairs eligible. Shuffle-bag default: shuffle, play through, refill when empty, no consecutive repeat unless one video. Works with 1, many, and changing counts. Smooth video→video transition; where practical two video elements preload + crossfade; old video stopped/released; never two full-volume videos; audio in sync with visible video.
Exit: a single tap anywhere → stop slideshow, stop/release current video, cancel timers, transition to gallery with cards animating in, reset idle timer. Not abrupt. No normal controls in slideshow.

## 9. Animation system
Reusable presets (not ad-hoc): gallery entrance/exit, card hover/press/selection, player entrance/exit, control reveal/hide, slideshow entrance/exit, page transition, empty-state entrance, admin panel entrance. Suggested durations: hover 180-250 ms, press 100-150, stagger 50-80, gallery transition 450-650, player 400-600, controls 200-300, slideshow 400-700. Smooth easing, no excessive bounce, don't block the main thread. Taps during transitions must never start multiple players or fire multiple navigations.

## 10. Sound effects
Subtle, short, elegant, original (Web Audio or bundled original assets; nothing copyrighted). Required: card tap, card selection, gallery entrance, return to gallery, slideshow transition, optional error. `SFX_ENABLED=true`, plus a global UI volume or disable. UI sound volume independent from video volume; SFX must not interfere with the video soundtrack.

## 11. Admin interface (hidden)
Access: Ctrl+Alt+S (dev/test) and a long-press on a hidden UI area for touch. No obvious settings button. Functions: show current root, native Windows folder picker, change root, rescan, valid pair count, ignored orphan count, scan errors, test video playback, save, return to gallery. On folder change: stop player, cancel timers, update root, scan new folder, rebuild collection, return to gallery, restart idle timer. Validate folder before applying. Renderer never gets raw filesystem access.

## 12. State architecture
States: INITIALIZING, SCANNING_MEDIA, GALLERY, INDIVIDUAL_PLAYER, SLIDESHOW, ADMIN_PANEL, ERROR. Flow: INIT→SCANNING→GALLERY; GALLERY→(select)→PLAYER→(end)→GALLERY; GALLERY→(idle)→SLIDESHOW→(end)→SLIDESHOW; SLIDESHOW→(tap)→GALLERY; any operational state→(admin shortcut)→ADMIN_PANEL→(save/close)→GALLERY. Central transitions; no competing timeout logic in components. Cleanup on every screen change: clear timers, remove listeners, stop unused video, release media refs, prevent simultaneous playback sessions.

## 13. Structure (keep folder names)
`src/main` (window, services: MediaScanner, MediaPairMatcher, MediaWatcher, ConfigurationService, FolderSelectionService, Logger; ipc) → Rust equivalents in `src-tauri/src`; `src/preload` → bridge; `src/renderer/src/{app (App, AppRouter, AppState), components (MediaCard, MediaGrid, VideoPlayer, PlayerControls, LoadingScreen, ErrorScreen, PageIndicator, AdminPanel), screens (GalleryScreen, IndividualPlayerScreen, SlideshowScreen), services (AudioService, AnimationService, PlaybackService, IdleTimerService), stores (mediaStore, playerStore, applicationStore, settingsStore), hooks (useIdleTimer, useVideoPlayback, useMediaCollection), styles (variables.css, global.css, animations.css), types (MediaItem, ApplicationState, Settings)}`; `tests/{unit,integration}`; `docs/{architecture,project-overview,development-guide,configuration-guide}.md`. Focused components, explicit TS types, avoid `any` unless documented.

## 14. Edge cases (never crash on single media failure)
Folder missing; empty; only videos; only images; no valid pairs; corrupted video; corrupted thumbnail; unsupported MP4 encoding; playback failure; slideshow failing to advance; file deleted while playing; file added while running; permission denied; folder changed during playback; exactly one valid pair; more than eight pairs; duplicate image extensions; missing duration/metadata; app loses/regains focus; repeated taps during transitions. Slideshow failure → skip to next playable; all fail → administrative error state, not an infinite loading screen.

## 15. Performance
Runs for days. Avoid re-renders, load thumbnails efficiently and lazily, never decode all videos, only the active video plays, preload metadata only, no large in-memory buffers, hardware acceleration, no video element leaks, release media on screen exit, no audio overlap, no decorative continuous GPU effects.

## 16. Kiosk behaviour
Fullscreen at startup, no menu bar/chrome/navigation UI, no context menu, no text selection, no drag-drop of files, touch + mouse, handle DPI scaling, resist accidental closure. Documented admin exit: Ctrl+Alt+Q. Escape must NOT close the app. Windows-compatible paths. Installable and launchable independent of dev environment.

## 17. Tests
Scanner: matching, missing image, missing video, case-insensitive, multiple thumbnails, natural sort, empty dir, unsupported formats. App logic: gallery→player, player→gallery, idle timeout, slideshow start/next/tap-exit, timer cancellation, single-item shuffle, repeated interaction. Playback: play, pause, seek, volume, completion, failure, slideshow advancement. Use Vitest + Playwright (+ cargo test). Provide test media dir or instructions to build fixtures.

## 18. Packaging
Tauri bundler → Windows x64 installer, app icon, correct name, version info, no Node needed on target, all assets local, no runtime internet. Scripts: `npm run dev`, `build`, `test`, `package`, `dist`. Document configuring the media directory after install. Packaged app reads `.env` beside exe and persists folder override in user-data dir.

## 19. Docs required
`project-overview.md`, `architecture.md` (Mermaid architecture + sequence diagrams: Tauri architecture, backend/renderer responsibilities, IPC, scanner, state machine, playback lifecycle, idle handling, slideshow), `configuration-guide.md` (.env, media folder, naming, extensions, change folder, timeouts, sound), `development-guide.md` (setup, deps, run, test, package, debugging).

## 20. Phases
1 Foundation (shell, secure bridge, kiosk window) · 2 Media management (+unit tests) · 3 Gallery UI + SFX · 4 Player · 5 Slideshow · 6 Polish + admin + errors + perf + resolutions · 7 Tests + Windows packaging + verify packaged exe, `.env` beside exe, fullscreen kiosk, idle slideshow. After each phase: build, run tests, fix, update docs, summarise.

## 21. Definition of done
Launches on Windows; fullscreen 16:9; `.env` root; in-app folder select; scan + match + ignore orphans; only valid pairs; filename titles; correct thumbnails; >8 items paginate; polished animations; animated card selection; individual playback; controls hidden by default, smooth reveal/hide; tap contract; seeking; volume/mute; end returns to gallery; idle → slideshow; auto-advance; no stuck-on-failure; tap exits slideshow with gallery return animation; SFX work; timers/resources cleaned; no major leaks in long runs; tests pass; installer builds; packaged app works without dev tools; docs complete.

Final report must contain: functionality summary, architecture, test results, exact run command, exact installer command, installer location, remaining limitations. Priorities: reliable playback > correct discovery/matching > robust state > smooth kiosk interaction > animation quality > long-term stability > easy deployment. Never: static prototype, hardcoded sample cards, simulated playback, nonfunctional buttons, placeholder handlers.
