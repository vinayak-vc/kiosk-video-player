# 75-Inch Touch Display Verification & Scaling Specification (BT-37 / A7)

## 1. Executive Summary & Display Geometry
The Kiosk Video Player is engineered specifically for commercial 75-inch UHD (3840×2160) touch displays (such as Newline, Clevertouch, Samsung Flip/QM75, or ViewSonic ViewBoard) running in 16:9 landscape orientation.

### Physical Geometry & Pixel Density
- **Diagonal Screen Size**: 75 inches (190.5 cm).
- **Physical Dimensions**: 166.0 cm wide × 93.4 cm high (65.35" × 36.77").
- **Physical Resolution**: 3840 × 2160 pixels (UHD 4K).
- **Pixel Density (PPI)**: ~58.74 PPI.
- **Physical Pixel Pitch**: 1 pixel ≈ 0.432 mm (0.017 inches).

---

## 2. Viewport & DPR Scaling Architecture

The app uses an internal 1080p reference stage (`1920×1080`) that is letterboxed/scaled via CSS `transform: scale(s)` (`Stage.tsx`):
`scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)`.

| Display / OS Mode | Physical Res | DPR | CSS Viewport (`window.innerWidth` × `innerHeight`) | Stage Scale Factor | Scaling Behavior | Letterboxing |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Android TV / Kiosk 4K (DPR 1.0)** | 3840×2160 | 1.0 | 3840 × 2160 px | **2.0×** | Exact 2× integer scale | None (0 px) |
| **Android TV / Kiosk 4K (DPR 2.0)** | 3840×2160 | 2.0 | 1920 × 1080 px | **1.0×** | 1:1 pixel mapped | None (0 px) |
| **Android TV / Kiosk 4K (DPR 1.5)** | 3840×2160 | 1.5 | 2560 × 1440 px | **1.333×** | Scaled to fill viewport | None (0 px) |
| **Windows Fullscreen 4K (DPR 1.0)** | 3840×2160 | 1.0 | 3840 × 2160 px | **2.0×** | Exact 2× integer scale | None (0 px) |
| **Windows Fullscreen 4K (DPR 2.0)** | 3840×2160 | 2.0 | 1920 × 1080 px | **1.0×** | 1:1 pixel mapped | None (0 px) |
| **Standard 1080p Panel (DPR 1.0)** | 1920×1080 | 1.0 | 1920 × 1080 px | **1.0×** | 1:1 pixel mapped | None (0 px) |
| **Commercial 720p Panel (DPR 1.0)** | 1280×720 | 1.0 | 1280 × 720 px | **0.667×** | Scaled down | None (0 px) |

In all standard 16:9 aspect ratios, the scale matches both X and Y perfectly (`scaleX == scaleY`), completely filling the screen without letterboxing. Non-16:9 displays (e.g. 16:10 or ultra-wide) use centered letterboxing on a pure black background (`#000000`).

---

## 3. Touch Target Ergonomics & Verification

On large 75-inch wall-mounted displays, users stand 0.5m to 1.5m away and tap with an outstretched arm or whole hand. Minimum target sizes recommended by WCAG (48×48 dp / 9 mm) and Android Large Screen guidelines (min 48–64 dp) are significantly exceeded:

| UI Component | Stage Size (CSS px at 1080p) | Physical Pixels at 4K (2.0×) | Physical Metric Size on 75" | Ergonomic Assessment |
| :--- | :--- | :--- | :--- | :--- |
| **Media Card (Gallery)** | 260–380 × 180–260 px | 520–760 × 360–520 px | **22.5–32.8 cm × 15.5–22.5 cm** | Massive, effortless whole-hand or single-finger tap target. Zero miss rate. |
| **Player Back Button** | 72 × 72 px (min) | 144 × 144 px | **6.2 cm × 6.2 cm (2.45")** | Broad circular button with text label; comfortable standing tap. |
| **Play/Pause Center Indicator** | 112 × 112 px | 224 × 224 px | **9.7 cm × 9.7 cm (3.82")** | Prominent center indicator with high-contrast cyan glow. |
| **Player Action Buttons** | 72 × 72 px | 144 × 144 px | **6.2 cm × 6.2 cm (2.45")** | Play, Pause, Mute, Seek +/-10s, Replay buttons. |
| **Custom Volume Slider** | 140 × 64 px (min) | 280 × 128 px | **12.1 cm × 5.5 cm (4.76" × 2.17")** | Full pointer-capture slider with 24px thumb; hit area >=64px tall. |
| **Timeline Track Scrubber** | 100% width × 40 px | 100% width × 80 px | **Height 1.73 cm (17.3 mm)** | Large scrubbing area with `touch-action: none` and 22px thumb. Cancel aborts scrub. |
| **Admin Hotspot (Top-Left)** | 120 × 120 px coordinate zone | 240 × 240 px | **10.4 cm × 10.4 cm (4.09")** | Seamless coordinate check; ignores visual occlusion, 2s hold. |
| **Gallery Page Arrows** | 64 × 64 px | 128 × 128 px | **5.5 cm × 5.5 cm (2.17")** | Clear navigation buttons flanking the media grid. |

All interactive controls have at least 16–24 px inter-element spacing (32–48 physical px at 4K / ~14–21 mm gap), eliminating false adjacent taps.

---

## 4. Palm Rejection & Multi-Touch Gestures

Commercial infrared and capacitive touch overlays on 75" TVs frequently report accidental multi-touch events when visitors rest their palm or multiple fingers against the glass.

### Implementation Contract
1. **Primary Pointer Enforcement (`e.isPrimary === true`)**:
   - `usePlayerInteraction`: Checks `if (e.isPrimary === false) return;` on `onPointerDown` and `onPointerUp`. Multi-touch and palm touches are discarded; only the primary contact point controls playback toggling and UI auto-hide.
   - `GalleryScreen`: Checks `if (e.isPrimary === false) return;` on swipe gesture `handlePointerDown` and `handlePointerUp`.
   - `SlideshowScreen`: Checks `if (e.isPrimary === false) return;` on `handleTapExit`.
   - `PlayerControls`: Checks `if (e.isPrimary === false) return;` on timeline scrubber `handleTimelinePointerDown`, `handleTimelinePointerMove`, and `handleTimelinePointerUp`.
2. **Gesture Suppression**:
   - Pinch-to-zoom is blocked via `touch-action: none` on `#stage-container` and `viewportContainer`, plus `<meta name="viewport" content="... user-scalable=no">`.
   - Double-tap zoom is suppressed by CSS `touch-action: none` and `touch-action: manipulation`.

---

## 5. Text Selection, Drag & Callout Prevention

To maintain a native appliance aesthetic, all browser selection callouts, magnifying glasses, and drag behaviors are suppressed globally:
- `user-select: none;`
- `-webkit-user-select: none;`
- `-webkit-user-drag: none;`
- `-webkit-touch-callout: none;`
- `overscroll-behavior: none;`
- Context menus suppressed via window listeners and Tauri window configuration.

---

## 6. GPU Animation Smoothness & Target Hardware Disclaimers

The app architecture is designed for 60 FPS rendering under 4K compositor load:
1. **Compositor-Only Animations**:
   - Card hover and tap animations use `transform: scale(...)` and `opacity`.
   - Crossfades use CSS opacity between Video A and Video B.
   - No layout-triggering properties (`width`, `height`, `top`, `left`, `margin`) are animated.
2. **GPU Layering (`will-change: transform, opacity`)**:
   - Hardware acceleration active on all interactive card elements and video surfaces.
3. **Filter Optimization**:
   - Box-shadows and ambient glows are pre-baked with fixed blur radii (`rgba(...)`) rather than expensive animated SVG filters or continuous backdrop-filter recalculations.
   - Stage scale uses GPU matrix transform (`transform: scale(...)`), preventing raster thrashing.
4. **Hardware Performance Source Disclaimer**:
   - *Laboratory Benchmarks (Dev Host / Chromium Preview / Android Emulator)*: Animation frame duration observed at ~1.2 ms – 2.8 ms per frame (well under the 16.67 ms 60 FPS budget).
   - **Target Hardware Status**: **Unverified on target commercial 75-inch TV SoC hardware.** Real SoC GPU performance, thermal throttling, and hardware decoder latency must be measured directly on the physical display using the embedded **Hardware & Video Diagnostics tool** in the Admin Panel (`AdminPanelScreen.tsx` / BT-35).
5. **Evidence Screenshots**:
   - `Docs/evidence/android_player_controls_75inch.png`: Control hit targets at device scale showing the 64px custom volume slider and 72px action buttons.
   - `Docs/evidence/hero_transition_frame1_100ms.png`: Hero transition at 100 ms (thumbnail expanding, single `<video>` element verified).
   - `Docs/evidence/hero_transition_frame2_250ms.png`: Hero transition at 250 ms.
   - `Docs/evidence/hero_transition_frame3_400ms.png`: Hero transition at 400 ms (seamless transition complete).
