# Development & Toolchain Guide: Kiosk Video Player

## 1. Prerequisites & Toolchain Setup

### 1.1 Core Requirements
- **Node.js**: v20+ or v22+ LTS
- **Rust**: stable toolchain (1.77+) with `cargo`
- **Android Development**:
  - Android SDK (API 34 / Android 14)
  - Android NDK 27.x (e.g. `27.2.12479018`)
  - JDK 17 (Microsoft OpenJDK 17 or Eclipse Adoptium)
  - Rust Android targets:
    ```powershell
    rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
    ```

---

## 2. Essential Development Commands

### 2.1 Web & Unit Testing
```powershell
# Install frontend dependencies
npm install

# Run Vitest unit & integration test suites (19 test files, 143 tests)
npm test -- --run

# Run Playwright E2E browser tests (Chromium, 1080p kiosk viewport)
npm run test:e2e

# Production frontend build
npm run build
```

### 2.2 Rust Backend Verification
```powershell
# Run Rust unit tests (32 tests covering scanner, watcher, protocol, config)
cargo test --manifest-path src-tauri/Cargo.toml

# Strict Clippy linter check (zero warnings enforced)
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings

# Android aarch64 cross-compilation check
cargo check --target aarch64-linux-android --manifest-path src-tauri/Cargo.toml
```

### 2.3 Android Build & Packaging
```powershell
# Generate external release keystore (dynamic JAVA_HOME lookup)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-keystore.ps1

# Build release APK (universal APK output to android-out/kiosk-player-v1.0.0-release.apk)
npm run android:release

# Automated device provisioning and installation via ADB
npm run android:install
```

### 2.4 Test Fixtures Generation
```powershell
# Generate deterministic test media fixture directory
node scripts/generate-fixtures.cjs test-fixtures/media
```

---

## 3. Project Directory Structure

```
C:\React\kiosk-video-player
├── android-out/              # Sideload package directory (release APK + INSTALL.md)
├── Docs/                     # Full system documentation & evidence captures
│   ├── evidence/             # Visual proof screenshots (1080p, 4K, hero transitions)
│   ├── project-overview.md
│   ├── architecture.md
│   ├── configuration-guide.md
│   ├── development-guide.md
│   └── ANDROID_DEPLOYMENT_GUIDE.md
├── e2e/                      # Playwright E2E integration specifications
├── scripts/                  # Automation scripts (build, install, keystore, fixtures, soak)
├── src/                      # Frontend application (React 19 + TypeScript + Zustand)
│   ├── renderer/src/app/     # App shell, Stage scaler, Admin Hotspot
│   ├── renderer/src/screens/ # GalleryScreen, SlideshowScreen, AdminPanelScreen
│   ├── renderer/src/stores/  # Zustand state machines (application, media, player, settings)
│   └── test/                 # Vitest test suites (19 files, 143 tests)
└── src-tauri/                # Backend (Rust core, media scanner, watcher, IPC)
```
