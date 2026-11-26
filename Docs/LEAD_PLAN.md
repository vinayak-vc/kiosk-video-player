# Kiosk Video Player — Lead Plan & Implementer Contract

Roles: **Claude = Lead / planner / reviewer / critic.** **Antigravity = implementer.**
Source of truth for requirements: the full project brief (sections 1-21) pasted by the owner; this file records the Lead's binding decisions and the work breakdown. Visual reference: `Docs/mockup/a_polished_ui_ux_design_board_layout_kiosk_app_mo.png`.

## Workflow rules (binding)
1. Work only from tasks on the kanban board. Move a card to **in-progress** when you start, to **review** when done. Never to **done** — only Lead moves cards to done.
2. Comment on the card with: files changed, commands run, test output summary, known gaps.
3. Message Lead (mailbox) when a card enters review. Wait for ACCEPTED / CHANGES_REQUESTED.
4. Do not start phase N+1 until phase N is accepted (parallel cards inside a phase are fine).
5. Never fake: no hardcoded gallery cards, no simulated playback, no placeholder handlers. Do not claim a build/test passed without running it and pasting the result.
6. Small commits are welcome, one per card, message `P<phase>: <card title>`. Do not commit `.env`, `node_modules`, `target`, build outputs.
7. If a requirement is ambiguous or impossible, comment on the card and message Lead rather than guessing.

## Binding architecture decisions
The brief mixes Electron wording (preload, nodeIntegration, contextIsolation, electron-builder) with Tauri. **Tauri v2 is the platform.** Mapping:

| Brief says | We implement |
|---|---|
| main process | Rust backend (`src-tauri/`) |
| preload + restricted API | `src/renderer/src/services/bridge.ts` — the ONLY module that calls `invoke`/`listen`; typed wrappers over a fixed set of Rust commands |
| validate IPC inputs | Rust-side validation in every command (paths canonicalised, extension allow-list, no arbitrary fs read/write commands exposed) |
| nodeIntegration false / contextIsolation true | Tauri capabilities: minimal permission set, no `fs`/`shell` plugin exposed to the webview; custom commands only; strict CSP, no remote content |
| electron-builder | `tauri build` → NSIS installer (x64, per-machine or per-user), icon, version info |
| `src/main`, `src/preload`, `src/renderer` | Rust in `src-tauri/src/{config,media,watcher,commands,window,logger}`; React in `src/renderer/src/...` per brief §13 layout. Keep the folder names so the brief's structure is recognisable |

Other decisions:
- **Media serving:** custom URI scheme protocol (`kiosk-media://`) registered in Rust that serves ONLY files inside the currently resolved media root, only allow-listed extensions, with HTTP Range support (required for seeking in `<video>`). No `asset:` protocol with wildcard scope. Reject `..`, symlink escapes, other drives.
- **Scanner:** implemented in Rust (authoritative) with the matching/sorting logic in a pure module that has `cargo test` tests. The brief also asks for scanner unit tests in Vitest, so the identical pure matching rules are mirrored in `src/renderer/src/shared/pairMatcher.ts` ONLY if the renderer needs it (e.g. admin preview); otherwise Rust tests are the scanner tests. Lead decision: **Rust owns scanning; Rust tests cover §17 scanner list; Vitest covers app logic + playback.**
- **Config:** `.env` beside the exe (dev: project root) parsed in Rust; folder override persisted as JSON in app data dir (`%APPDATA%/<identifier>/config.json`). Priority: admin-selected > `.env`. Never write `.env`.
- **State machine:** one pure reducer/transition table in `AppState.ts` (INITIALIZING, SCANNING_MEDIA, GALLERY, INDIVIDUAL_PLAYER, SLIDESHOW, ADMIN_PANEL, ERROR) + one `IdleTimerService` singleton. Components never own timers for navigation. Transition lock prevents double navigation during animations.
- **Idle timer:** single timer, owned by the service, driven by state-machine side-effects; paused while video actively playing in INDIVIDUAL_PLAYER; armed in GALLERY and when a player is paused/abandoned.
- **Slideshow:** two `<video>` elements A/B, preload next, crossfade by opacity; only the active element is unmuted; the old one is paused, `removeAttribute('src')`, `load()` to release. Shuffle-bag with no immediate repeat. Failed video → skip; all failed → ERROR/admin state.
- **Audio:** UI SFX synthesised with Web Audio API (no assets), separate master gain; video volume independent.
- **Kiosk window:** fullscreen, decorations off, always-on-top configurable, context menu disabled, drag-drop disabled, devtools disabled in release, Ctrl+Alt+Q exit, Ctrl+Alt+S admin; long-press hidden hotspot (top-left corner, 2 s) for touch.
- **Scaling:** fixed 1920x1080 design stage scaled with CSS `transform: scale()` to fit the viewport (letterbox if not exactly 16:9); verify at 1280x720, 1920x1080, 2560x1440, 3840x2160.
- **State/UI libs:** Zustand, Framer Motion (use `LayoutGroup`/`layoutId` for card→player), Lucide, CSS Modules. No CDN. Fonts bundled locally (system font stack acceptable; if a webfont is used, vendor it).
- **Tests:** Vitest (+ React Testing Library, jsdom) for app logic/player/controls; `cargo test` for scanner/config; Playwright against the Vite dev server with a mocked bridge for E2E flows (tap contract, slideshow, tap-to-exit). Sample fixtures generated by a script (`scripts/make-fixtures.ps1` or node) producing tiny valid mp4 via ffmpeg if available, else committed ≤100 KB sample clips; document in dev guide.

## Phases and cards (mirrors the kanban board)

**P1 Foundation**
- P1-1 Scaffold Tauri v2 + React + TS + Vite + Zustand + Framer Motion + Lucide; scripts `dev/build/test/package/dist`; `.gitignore`; `.env.example`
- P1-2 Rust backend skeleton: module layout, logger (file in app data, rotating), command registry, strict CSP + minimal capabilities
- P1-3 Kiosk window (fullscreen, no chrome, context menu/drag-drop/devtools off, Ctrl+Alt+Q exit)
- P1-4 `bridge.ts` typed API + renderer folder structure per brief §13, design tokens, 1920x1080 scaled stage

**P2 Media management**
- P2-1 Configuration service (.env beside exe, app-data override, priority, validation)
- P2-2 Folder selection (native dialog command), folder validation
- P2-3 Scanner + pair matcher (case-insensitive, PNG>JPG>JPEG, natural sort, orphans/ignored counts, errors, MediaItem struct)
- P2-4 `kiosk-media://` protocol with Range support + path-jail
- P2-5 Debounced watcher → `media-changed` event
- P2-6 Rust tests for scanner/config (all §17 scanner cases)

**P3 Gallery**
- P3-1 App state machine + stores (application/media/player/settings) + transition lock
- P3-2 Gallery screen, MediaGrid (4x2, centering), MediaCard, pagination, swipe, PageIndicator
- P3-3 Animation preset system (`AnimationService.ts`) + card entrance/hover/press/select
- P3-4 AudioService (Web Audio SFX) + settings
- P3-5 Loading / Error / Empty screens

**P4 Player**
- P4-1 VideoPlayer + `useVideoPlayback` (lifecycle, release, error overlay)
- P4-2 PlayerControls (play/pause, seek w/ touch drag, time, volume, mute, fullscreen) + reveal/hide animations
- P4-3 Tap contract + auto-hide + paused-keeps-visible + pointer-event dedupe
- P4-4 Card→player shared-layout transition; end-of-video return (RETURN_TO_GALLERY_ON_END)

**P5 Slideshow**
- P5-1 IdleTimerService (single timer) wired to state machine
- P5-2 Shuffle-bag + slideshow controller (skip failed, all-failed → error)
- P5-3 Dual-video crossfade SlideshowScreen, tap-anywhere exit, gallery return animation

**P6 Polish & admin**
- P6-1 AdminPanel (hidden access, folder picker, rescan, counts, errors, test playback, save)
- P6-2 Folder-change flow (stop player, cancel timers, rescan, return to gallery)
- P6-3 Edge cases §14 sweep + focus loss/regain + file deleted mid-play
- P6-4 Performance/long-run review (leaks, listeners, re-renders), resolution matrix check

**P7 Test & package**
- P7-1 Vitest suites (state machine, idle, slideshow, shuffle, player/tap contract)
- P7-2 Playwright E2E with fixtures
- P7-3 `tauri build` NSIS installer, icon, version info; verify packaged exe with `.env` beside exe
- P7-4 Docs: project-overview, architecture (Mermaid), configuration-guide, development-guide

## Lead review checklist (applied to every card)
- Does it match the brief literally (tap contract, matching rules, priorities)?
- Any path/IPC input unvalidated? Any wide Tauri permission?
- Timers/listeners/video elements cleaned up on every exit path?
- Re-render hot spots; transform/opacity-only animations?
- Real tests that fail when the code is wrong (not snapshot-of-nothing)?
- Build + tests actually executed, output attached.
