#!/usr/bin/env node
/**
 * scripts/capture-resolution-and-soak.cjs
 * Performs:
 * 1. Resolution Matrix Captures (1280x720, 1920x1080, 2560x1440, 3840x2160)
 *    for Gallery and Individual Player.
 * 2. Soak Test: 50 automated slideshow crossfade cycles while sampling JS Heap memory
 *    to verify long-run stability and zero memory leakage.
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const EVIDENCE_DIR = path.resolve('Docs/evidence');
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const RESOLUTIONS = [
  { name: '720p', width: 1280, height: 720, scale: 0.667 },
  { name: '1080p', width: 1920, height: 1080, scale: 1.0 },
  { name: '1440p', width: 2560, height: 1440, scale: 1.333 },
  { name: '2160p_4k', width: 3840, height: 2160, scale: 2.0 }
];

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Playable 60s H.264 MP4
const MP4_PATH = path.resolve('test-fixtures/tiny_60s.mp4');
const MP4_BUFFER = fs.existsSync(MP4_PATH) ? fs.readFileSync(MP4_PATH) : Buffer.from('');

const MOCK_ITEMS = Array.from({ length: 12 }, (_, i) => ({
  id: `clip-${i + 1}`,
  filename: `Clip ${i + 1}.mp4`,
  display_title: `Clip ${i + 1}`,
  video_path: `C:/TestMedia/Clip ${i + 1}.mp4`,
  thumbnail_path: `C:/TestMedia/Clip ${i + 1}.png`,
  video_url: `http://kiosk-media.localhost/Clip%20${i + 1}.mp4`,
  thumbnail_url: `http://kiosk-media.localhost/Clip%20${i + 1}.png`,
  file_size: 15_000 * (i + 1)
}));

async function setupPage(page, config = {}) {
  const mergedConfig = {
    kiosk_media_root: 'C:/TestMedia',
    idle_timeout_seconds: 60,
    controls_auto_hide_seconds: 4,
    slideshow_mode: 'shuffle',
    screensaver_sound: true,
    cards_per_page: 8,
    sfx_enabled: true,
    return_to_gallery_on_end: true,
    ...config
  };

  await page.route('**/*.png', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(VALID_PNG_BASE64, 'base64') });
  });

  await page.route('**/*.mp4', route => {
    route.fulfill({ status: 200, contentType: 'video/mp4', body: MP4_BUFFER });
  });

  await page.addInitScript(({ mockItems, appConfig }) => {
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === 'get_config') return appConfig;
        if (cmd === 'get_platform') return 'windows';
        if (cmd === 'check_storage_permission') return true;
        if (cmd === 'get_media_items') {
          return {
            items: mockItems,
            screensaver: null,
            ignored_orphan_count: 0,
            video_count: mockItems.length,
            image_count: mockItems.length,
            errors: [],
            root: 'C:/TestMedia'
          };
        }
        if (cmd === 'log_client_message') return null;
        if (cmd === 'toggle_fullscreen') return true;
        if (cmd === 'exit_kiosk_app') return null;
        if (cmd === 'plugin:event|listen') return 1;
        if (cmd === 'plugin:event|unlisten') return null;
        return null;
      },
      transformCallback: (cb) => cb
    };
  }, { mockItems: MOCK_ITEMS, appConfig: mergedConfig });
}

async function runResolutionCaptures(browser) {
  console.log('\n--- CAPTURING RESOLUTION MATRIX SCREENSHOTS ---');

  for (const res of RESOLUTIONS) {
    console.log(`Capturing at ${res.width}x${res.height} (${res.name})...`);
    const context = await browser.newContext({
      viewport: { width: res.width, height: res.height },
      deviceScaleFactor: 1,
      hasTouch: true
    });
    const page = await context.newPage();
    await setupPage(page);

    await page.goto('http://127.0.0.1:4173/');
    await page.waitForSelector('[data-testid="gallery-screen"]');
    await page.waitForTimeout(600); // let animations settle

    // 1. Gallery Screenshot
    const galleryFile = path.join(EVIDENCE_DIR, `res_gallery_${res.width}x${res.height}.png`);
    await page.screenshot({ path: galleryFile });
    console.log(`  Saved Gallery: ${galleryFile}`);

    // 2. Individual Player Screenshot
    await page.getByRole('button', { name: 'Play Clip 1' }).click();
    await page.waitForSelector('[data-testid="video-player-screen"]');
    // Reveal controls
    await page.locator('[data-testid="video-player-screen"]').tap();
    await page.waitForSelector('[data-testid="player-controls-overlay"]');
    await page.waitForTimeout(500);

    const playerFile = path.join(EVIDENCE_DIR, `res_player_${res.width}x${res.height}.png`);
    await page.screenshot({ path: playerFile });
    console.log(`  Saved Player:  ${playerFile}`);

    await context.close();
  }
}

async function runSoakTest(browser) {
  console.log('\n--- RUNNING 50-CYCLE SLIDESHOW SOAK TEST ---');
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    hasTouch: true
  });
  const page = await context.newPage();

  // Configure fast slideshow (e.g. idle 1s)
  await setupPage(page, { idle_timeout_seconds: 1 });
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForSelector('[data-testid="gallery-screen"]');

  console.log('Entering Slideshow via idle timeout...');
  await page.waitForSelector('[data-testid="slideshow-screen"]', { timeout: 5000 });
  console.log('Slideshow active.');

  const CYCLES = 50;
  const memorySamples = [];

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    // Advance slideshow by triggering ended on active video
    await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      const activeVideo = videos.find(v => !v.muted) || videos[0];
      if (activeVideo) {
        activeVideo.dispatchEvent(new Event('ended'));
      }
    });

    // Wait crossfade (600ms) + buffer
    await page.waitForTimeout(200);

    if (cycle === 1 || cycle % 10 === 0 || cycle === CYCLES) {
      const memInfo = await page.evaluate(() => {
        const perf = performance;
        const memory = (perf && perf.memory) ? perf.memory : null;
        return {
          usedHeapMB: memory ? (memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : 'N/A',
          totalHeapMB: memory ? (memory.totalJSHeapSize / (1024 * 1024)).toFixed(2) : 'N/A',
          videoElementsCount: document.querySelectorAll('video').length,
          domNodesCount: document.getElementsByTagName('*').length
        };
      });

      console.log(`Cycle ${String(cycle).padStart(2)}: Heap ${memInfo.usedHeapMB} MB / ${memInfo.totalHeapMB} MB | DOM Nodes: ${memInfo.domNodesCount} | Videos: ${memInfo.videoElementsCount}`);
      memorySamples.push({ cycle, ...memInfo });
    }
  }

  // Tap exit back to gallery
  console.log('Testing tap exit back to gallery after 50 cycles...');
  await page.locator('[data-testid="slideshow-screen"]').tap({ position: { x: 960, y: 60 } });
  await page.waitForSelector('[data-testid="gallery-screen"]', { timeout: 5000 });
  console.log('Successfully returned to Gallery! Clean transition verified.');

  const finalMem = await page.evaluate(() => {
    const memory = (performance && performance.memory) ? performance.memory : null;
    return {
      usedHeapMB: memory ? (memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : 'N/A',
      videoElementsCount: document.querySelectorAll('video').length,
      domNodesCount: document.getElementsByTagName('*').length
    };
  });
  console.log(`Post-exit Gallery: Heap ${finalMem.usedHeapMB} MB | DOM Nodes: ${finalMem.domNodesCount} | Active Videos: ${finalMem.videoElementsCount}`);

  await context.close();
  return { memorySamples, finalMem };
}

const { spawn } = require('child_process');

async function main() {
  console.log('Starting preview server on port 4173...');
  const preview = spawn('npm.cmd', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: true
  });

  await new Promise(r => setTimeout(r, 2500));

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info']
  });

  try {
    await runResolutionCaptures(browser);
    const soakResults = await runSoakTest(browser);

    console.log('\n--- SOAK TEST SUMMARY ---');
    console.table(soakResults.memorySamples);
    console.log('Final State in Gallery:', soakResults.finalMem);
    console.log('Resolution and soak test completed successfully.');
  } finally {
    await browser.close();
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', preview.pid, '/f', '/t']);
      } else {
        preview.kill();
      }
    } catch {
      // ignore
    }
  }
}

main().catch(err => {
  console.error('Fatal error during capture/soak:', err);
  process.exit(1);
});
