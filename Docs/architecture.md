# Architecture Specification: Kiosk Video Player

## 1. System Architecture

The application adopts a hybrid Tauri v2 architecture designed for high responsiveness, minimal attack surface, and stable memory usage on Android TV and Windows.

```mermaid
flowchart TD
    subgraph Frontend["Renderer Layer (React 19 + TypeScript + Vite)"]
        Stage["Stage Scaler (1920x1080 -> Viewport Scale)"]
        UI["Screens: Gallery | VideoPlayer | Slideshow | AdminPanel"]
        Stores["Zustand Stores: ApplicationStore | MediaStore | PlayerStore | SettingsStore"]
        Services["Core Services: IdleTimerService | AudioService (Web Audio) | DiagnosticsService"]
        Bridge["Typed Tauri Bridge (src/renderer/src/services/bridge.ts)"]
    end

    subgraph IPC["Tauri IPC Boundary"]
        Commands["Tauri Commands: get_config, get_media_items, set_media_root, write_diagnostics, exit_kiosk_app"]
        Events["Tauri Events: media-changed, open-admin-panel"]
    end

    subgraph Backend["Rust Core Layer (src-tauri)"]
        ConfigMgr["ConfigManager (.env fallback + AppData JSON override)"]
        Scanner["MediaScanner (Regex pairing, PNG>JPG priority, Natural sort)"]
        Watcher["Debounced Directory Watcher (2.0s debounce, dirty reload)"]
        CmdHandlers["Validated Command Handlers"]
    end

    subgraph OS["Target Operating System (Android TV / Windows)"]
        Storage["Filesystem: /sdcard/Kiosk/Media (Android) or C:/Media (Windows)"]
        WebView["Platform WebView (Android System WebView / WebView2)"]
    end

    Stage --> UI
    UI --> Stores
    UI --> Services
    Stores --> Bridge
    Bridge -->|JSON-RPC via invoke()| Commands
    Events -->|listen()| Bridge
    Commands --> CmdHandlers
    CmdHandlers --> ConfigMgr
    CmdHandlers --> Scanner
    CmdHandlers --> Watcher
    Scanner --> Storage
    Watcher --> Storage
    WebView --> Frontend
```

---

## 2. Sequence Diagrams

### 2.1 Application Startup & Media Discovery

```mermaid
sequenceDiagram
    autonumber
    participant UI as React UI (App.tsx)
    participant Bridge as Typed Bridge
    participant Rust as Rust Core
    participant Disk as Media Storage

    UI->>Bridge: initPlatform()
    Bridge->>Rust: get_platform
    Rust-->>UI: "android" (or "windows")

    UI->>Bridge: checkStoragePermission()
    Bridge->>Rust: check_storage_permission
    Rust-->>UI: true (or false -> Storage Permission Gate)

    UI->>Bridge: getAppConfig()
    Bridge->>Rust: get_config
    Rust-->>UI: AppConfig (media root, timeouts, modes)

    UI->>Bridge: getMediaItems()
    Bridge->>Rust: get_media_items
    Rust->>Disk: Scan directory (shallow root only)
    Disk-->>Rust: Read directory entries
    Note over Rust: Match .mp4 with .png/.jpg/.jpeg<br/>Apply PNG > JPG > JPEG priority<br/>Sort naturally (1, 2, 10, 11)<br/>Isolate Screensaver.mp4
    Rust-->>UI: ScanResult (valid items, screensaver, orphan count)

    alt Scan has valid items or empty folder
        UI->>UI: dispatch("SCAN_OK") -> State: GALLERY
    else Scan has directory read error
        UI->>UI: dispatch("SCAN_FAIL") -> State: ERROR
    end
```

### 2.2 Individual Video Playback & Tap Contract

```mermaid
sequenceDiagram
    autonumber
    participant User as Visitor Touch
    participant Screen as VideoPlayer Screen
    participant Store as PlayerStore
    participant Video as HTML5 Video Element

    User->>Screen: Tap Card in Gallery
    Screen->>Store: selectMedia(id)
    Screen->>Screen: Hero transition expands thumbnail
    Screen->>Video: set src and play() [Controls hidden by default]

    opt Visitor Taps Video Surface while Playing
        User->>Screen: Tap blank video surface
        Screen->>Video: pause()
        Screen->>Store: setControlsVisible(true)
        Note over Screen: Auto-hide timer suspended while paused
    end

    opt Visitor Taps Video Surface while Paused
        User->>Screen: Tap blank video surface
        Screen->>Video: play()
        Screen->>Store: setControlsVisible(false)
    end

    opt Visitor Clicks Play/Pause Button on Control Bar
        User->>Screen: Click Play button
        Screen->>Video: play()
        Note over Screen: Controls REMAIN visible! No hide toggle.
        Screen->>Screen: Start auto-hide timer (4s)
    end

    opt Video Reaches Completion (ended event)
        Video-->>Screen: 'ended' event
        alt return_to_gallery_on_end is true
            Screen->>Screen: dispatch("VIDEO_ENDED") -> State: GALLERY
            Screen->>Store: clearSelection()
        else return_to_gallery_on_end is false
            Screen->>Store: setPlaying(false), setControlsVisible(true)
        end
    end
```

### 2.3 Idle Timeout & Dual-Video Slideshow Crossfade

```mermaid
sequenceDiagram
    autonumber
    participant Idle as IdleTimerService
    participant App as App Machine
    participant Slide as SlideshowScreen
    participant SlotA as Video Slot A
    participant SlotB as Video Slot B
    participant User as Visitor

    Idle->>App: Idle timeout reached (e.g. 60s)
    App->>App: dispatch("IDLE_TIMEOUT") -> State: SLIDESHOW
    App->>Slide: Mount SlideshowScreen
    Slide->>SlotA: load Track 1 & play(audible)
    Slide->>SlotB: preload Track 2 & pause(muted)

    Note over SlotA: Track 1 completes playback
    SlotA-->>Slide: 'ended' event
    Slide->>SlotB: un-mute & play()
    Slide->>SlotA: mute & fade opacity 1.0 -> 0.0 (600ms crossfade)
    Note over SlotA: After 600ms crossfade completes:
    Slide->>SlotA: pause(), removeAttribute('src'), load()
    Slide->>SlotA: preload Track 3 (muted)

    opt Visitor Touches Screen
        User->>Slide: Single touch anywhere
        Slide->>App: dispatch("SLIDESHOW_TAP") -> State: GALLERY
        Slide->>SlotA: pause() & release
        Slide->>SlotB: pause() & release
        App->>App: Mount GalleryScreen & reset IdleTimerService
    end
```
