#!/usr/bin/env node
/**
 * scripts/generate-fixtures.cjs
 * Generates deterministic test media fixtures for Kiosk Video Player tests:
 * - Valid pairs (.mp4 + .png/.jpg/.jpeg)
 * - Multiple thumbnails priority test (png > jpg > jpeg)
 * - Case-insensitive matching (.MP4 + .PNG)
 * - Natural numerical sorting (1, 2, 10, 11)
 * - Reserved Screensaver.mp4
 * - Orphan video without image (ignored by scanner, counted in ignored_orphan_count)
 * - Orphan image without video (ignored by scanner, counted in ignored_orphan_count)
 * - Unsupported formats (.txt, .mpg, .mkv - ignored, not counted)
 * - Subdirectory contents (ignored by root scanner)
 */

const fs = require('fs');
const path = require('path');

// 1x1 valid transparent PNG (67 bytes)
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// 1x1 valid minimal JPEG (125 bytes)
const VALID_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

// Minimal valid playable H.264 MP4 video container (2,239 bytes)
const VALID_MP4_BASE64 =
  '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';

const VALID_MP4 = Buffer.from(VALID_MP4_BASE64, 'base64');

function generateFixtures(targetDir) {
  const resolvedDir = path.resolve(targetDir);
  console.log(`Generating test media fixtures in: ${resolvedDir}`);

  if (fs.existsSync(resolvedDir)) {
    fs.rmSync(resolvedDir, { recursive: true, force: true });
  }
  fs.mkdirSync(resolvedDir, { recursive: true });

  const files = [
    // 1. Natural Sort Sequence (1, 2, 10, 11)
    { name: '1_Intro.mp4', data: VALID_MP4 },
    { name: '1_Intro.png', data: VALID_PNG },
    { name: '2_Walk.mp4', data: VALID_MP4 },
    { name: '2_Walk.png', data: VALID_PNG },
    { name: '10_Fly.mp4', data: VALID_MP4 },
    { name: '10_Fly.png', data: VALID_PNG },
    { name: '11_Run.mp4', data: VALID_MP4 },
    { name: '11_Run.png', data: VALID_PNG },

    // 2. Different supported image extensions
    { name: '01_Nature.mp4', data: VALID_MP4 },
    { name: '01_Nature.jpg', data: VALID_JPEG },
    { name: '02_Ocean.mp4', data: VALID_MP4 },
    { name: '02_Ocean.jpeg', data: VALID_JPEG },

    // 3. Case-insensitive matching (.MP4 with .PNG)
    { name: '03_City.MP4', data: VALID_MP4 },
    { name: '03_CITY.PNG', data: VALID_PNG },

    // 4. Multiple thumbnails priority (PNG > JPG > JPEG)
    // Scanner must pick 04_Priority.png
    { name: '04_Priority.mp4', data: VALID_MP4 },
    { name: '04_Priority.jpg', data: VALID_JPEG },
    { name: '04_Priority.png', data: VALID_PNG },

    // 5. Additional items to exceed 8 items (total 12 valid pairs) for pagination tests
    { name: '05_Space.mp4', data: VALID_MP4 },
    { name: '05_Space.png', data: VALID_PNG },
    { name: '06_Forest.mp4', data: VALID_MP4 },
    { name: '06_Forest.png', data: VALID_PNG },
    { name: '07_Desert.mp4', data: VALID_MP4 },
    { name: '07_Desert.png', data: VALID_PNG },
    { name: '08_Mountain.mp4', data: VALID_MP4 },
    { name: '08_Mountain.png', data: VALID_PNG },
    { name: '09_Island.mp4', data: VALID_MP4 },
    { name: '09_Island.png', data: VALID_PNG },
    { name: '12_Sunset.mp4', data: VALID_MP4 },
    { name: '12_Sunset.png', data: VALID_PNG },

    // 6. Reserved Screensaver pair (excluded from gallery items & orphans)
    { name: 'Screensaver.mp4', data: VALID_MP4 },
    { name: 'Screensaver.png', data: VALID_PNG },

    // 7. Orphans (counted in ignored_orphan_count)
    { name: 'Orphan_No_Image.mp4', data: VALID_MP4 },
    { name: 'Orphan_No_Video.png', data: VALID_PNG },
    { name: 'Orphan_No_Video_2.jpg', data: VALID_JPEG },

    // 8. Unsupported formats (ignored completely, NOT counted in orphans)
    { name: 'Notes.txt', data: Buffer.from('Plain text note') },
    { name: 'OldVideo.mpg', data: Buffer.from('Fake mpg stream') },
    { name: 'ModernVideo.mkv', data: Buffer.from('Fake mkv stream') },
  ];

  for (const file of files) {
    fs.writeFileSync(path.join(resolvedDir, file.name), file.data);
  }

  // 9. Nested subdirectory (nested files must be ignored by root-only scanner)
  const nestedDir = path.join(resolvedDir, 'nested_subfolder');
  fs.mkdirSync(nestedDir, { recursive: true });
  fs.writeFileSync(path.join(nestedDir, 'sub_video.mp4'), VALID_MP4);
  fs.writeFileSync(path.join(nestedDir, 'sub_image.png'), VALID_PNG);

  console.log(`Successfully generated ${files.length} fixture files in ${resolvedDir}`);
  console.log(`- 12 valid media pairs (1_Intro, 2_Walk, 10_Fly, 11_Run, 01..09, 12)`);
  console.log(`- 1 reserved screensaver (Screensaver.mp4)`);
  console.log(`- 3 orphan files (1 video, 2 images)`);
  console.log(`- 3 unsupported files (.txt, .mpg, .mkv)`);
  console.log(`- 1 nested directory (nested_subfolder with 2 files)`);

  return resolvedDir;
}

if (require.main === module) {
  const target = process.argv[2] || 'test-fixtures/media';
  generateFixtures(target);
}

module.exports = {
  generateFixtures,
  VALID_PNG,
  VALID_JPEG,
  VALID_MP4
};
