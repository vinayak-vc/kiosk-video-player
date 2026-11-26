# Test Media Fixtures Documentation

This document describes the test fixture generator for the Kiosk Video Player application, its directory structure, pairing rules, and integration with automated testing (Vitest, Playwright E2E, and Rust scanner unit tests).

---

## 1. Generating Fixtures

Run the generator script with Node.js:

```powershell
node scripts/generate-fixtures.cjs [outputDirectory]
```

- **Default output directory**: `test-fixtures/media`
- **Output**: Deterministic binary media files (valid 1x1 PNG, 1x1 JPEG, and minimal valid ISO Base Media File MP4 container with `ftyp`, `moov`, and `mdat` atoms).

---

## 2. Directory Structure and Test Coverage

The generated fixture directory contains 37 files designed to exercise every case specified in Brief §2 and Brief §17:

| Filename(s) | Role / Type | Expected Scanner Behavior |
|-------------|-------------|---------------------------|
| `1_Intro.mp4` + `1_Intro.png` | Valid pair | Matched as item (`1_Intro`), naturally sorted before `10_Fly` |
| `2_Walk.mp4` + `2_Walk.png` | Valid pair | Matched as item (`2_Walk`), naturally sorted before `10_Fly` |
| `10_Fly.mp4` + `10_Fly.png` | Valid pair | Matched as item (`10_Fly`), naturally sorted after `2_Walk` |
| `11_Run.mp4` + `11_Run.png` | Valid pair | Matched as item (`11_Run`), naturally sorted after `10_Fly` |
| `01_Nature.mp4` + `01_Nature.jpg` | Valid pair | Matched with `.jpg` thumbnail |
| `02_Ocean.mp4` + `02_Ocean.jpeg` | Valid pair | Matched with `.jpeg` thumbnail |
| `03_City.MP4` + `03_CITY.PNG` | Valid pair | Case-insensitive matching |
| `04_Priority.mp4` + `.png` + `.jpg` | Priority conflict | Priority rule selects `.png` over `.jpg` |
| `05_Space.mp4`..`09_Island.mp4` + `12_Sunset.mp4` | Valid pairs | Brings total gallery items to 12 (>8 for pagination) |
| `Screensaver.mp4` + `Screensaver.png` | Reserved screensaver | Excluded from gallery items; set as `screensaver` info |
| `Orphan_No_Image.mp4` | Orphan video | Ignored by gallery; counted in `ignored_orphan_count` |
| `Orphan_No_Video.png` | Orphan image | Ignored by gallery; counted in `ignored_orphan_count` |
| `Orphan_No_Video_2.jpg` | Orphan image | Ignored by gallery; counted in `ignored_orphan_count` |
| `Notes.txt`, `OldVideo.mpg`, `ModernVideo.mkv` | Unsupported formats | Ignored completely; NOT counted as orphans |
| `nested_subfolder/*` | Subdirectory | Ignored completely; root-only scanner rule enforced |

---

## 3. Expected Scanner Metrics

When `MediaScanner::scan_directory` runs against the generated fixtures folder:
- **`items.length`**: 12
- **`screensaver`**: Present (`Screensaver.mp4`)
- **`ignored_orphan_count`**: 3 (1 orphan video + 2 orphan images)
- **`video_count`**: 14 (12 pairs + 1 screensaver + 1 orphan video)
- **`image_count`**: 16 (12 pairs + 1 screensaver + 1 priority duplicate + 2 orphan images)
- **`errors`**: `[]` (empty)

---

## 4. Usage in Playwright E2E Tests

Playwright E2E tests consume these fixtures either directly via disk routing or via intercepted mocked bridge responses:

```typescript
import { generateFixtures } from '../scripts/generate-fixtures.cjs';

test.beforeAll(() => {
  generateFixtures('test-fixtures/media');
});
```
