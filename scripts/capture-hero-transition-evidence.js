import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT_DIR = 'C:/React/Videos/Futurotec_Videos/Futurotec_Videos';
const EVIDENCE_DIR = path.resolve('Docs/evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const items = [
  'Adani - Centre of Excellence',
  'Ambardi Wildliefr Interpretation Zone',
  'Dholera-Holographic Experiences',
  'Digital Twin of Dhanbad',
  'Dubai Digital Twin',
  'Gwalior-Holoraphic Experience',
  'PEG TUBE',
  'Port Immerse',
  'SoReal',
  'Work At Height',
  'YumaBay Eco Lodge'
].map((name, index) => ({
  id: `futurotec-${index + 1}`,
  filename: `${name}.mp4`,
  display_title: name,
  video_path: `${ROOT_DIR}/${name}.mp4`,
  thumbnail_path: `${ROOT_DIR}/${name}.png`,
  video_url: `http://kiosk-media.localhost/${encodeURIComponent(name)}.mp4`,
  thumbnail_url: `http://kiosk-media.localhost/${encodeURIComponent(name)}.png`,
  file_size: 150000000
}));

async function main() {
  console.log('Building dist...');
  const build = spawn('npm.cmd', ['run', 'build'], { stdio: 'inherit', shell: true });
  await new Promise(r => build.on('close', r));

  console.log('Starting preview server...');
  const preview = spawn('npm.cmd', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4175'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: true
  });

  await new Promise(r => setTimeout(r, 2500));

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      hasTouch: true
    });

    await context.addInitScript(({ mockItems }) => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          if (cmd === 'get_config') {
            return {
              kiosk_media_root: 'C:/React/Videos/Futurotec_Videos/Futurotec_Videos',
              idle_timeout_seconds: 60,
              controls_auto_hide_seconds: 4,
              slideshow_mode: 'screensaver',
              screensaver_sound: true,
              cards_per_page: 12,
              sfx_enabled: true,
              return_to_gallery_on_end: true
            };
          }
          if (cmd === 'get_platform') return 'android';
          if (cmd === 'check_storage_permission') return true;
          if (cmd === 'get_media_items') {
            return {
              items: mockItems,
              screensaver: null,
              ignored_orphan_count: 0,
              video_count: mockItems.length,
              image_count: mockItems.length,
              errors: [],
              root: 'C:/React/Videos/Futurotec_Videos/Futurotec_Videos'
            };
          }
          if (cmd === 'log_client_message') return null;
          return null;
        },
        transformCallback: (cb) => cb
      };
    }, { mockItems: items });

    const page = await context.newPage();

    // Serve real Futurotec thumbnail images from disk
    await page.route('**/*.png', route => {
      const url = route.request().url();
      const filename = decodeURIComponent(url.split('/').pop() || '');
      const diskPath = path.join(ROOT_DIR, filename);
      if (fs.existsSync(diskPath)) {
        route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: fs.readFileSync(diskPath)
        });
      } else {
        const fallback = path.join(ROOT_DIR, 'Adani - Centre of Excellence.png');
        route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: fs.readFileSync(fallback)
        });
      }
    });

    await page.route('**/*.mp4', route => {
      route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: Buffer.alloc(1024)
      });
    });

    await page.addInitScript(() => {
      const origAdd = HTMLMediaElement.prototype.addEventListener;
      HTMLMediaElement.prototype.addEventListener = function(type, listener, options) {
        if (type === 'error') return;
        return origAdd.call(this, type, listener, options);
      };

      HTMLMediaElement.prototype.play = function() {
        this.dispatchEvent(new Event('loadedmetadata'));
        setTimeout(() => {
          this.dispatchEvent(new Event('canplay'));
          this.dispatchEvent(new Event('playing'));
          this.currentTime = 0.5;
          this.dispatchEvent(new Event('timeupdate'));
        }, 600);
        return Promise.resolve();
      };
    });

    console.log('Navigating to app...');
    await page.goto('http://127.0.0.1:4175');
    await page.waitForSelector('[data-testid="gallery-screen"]', { timeout: 10000 });
    console.log('Gallery loaded!');

    // Capture initial gallery
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'hero_transition_frame0_gallery.png') });

    // Click card to start hero transition
    const card = page.locator('[aria-label^="Play "]').first();
    await card.click();

    // Frame 1: ~100ms
    await page.waitForTimeout(100);
    const videoCount1 = await page.locator('video').count();
    console.log(`Frame 1 (100ms): video count = ${videoCount1}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'hero_transition_frame1_100ms.png') });

    // Frame 2: ~250ms
    await page.waitForTimeout(150);
    const videoCount2 = await page.locator('video').count();
    console.log(`Frame 2 (250ms): video count = ${videoCount2}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'hero_transition_frame2_250ms.png') });

    // Frame 3: ~400ms (transition complete)
    await page.waitForTimeout(150);
    const videoCount3 = await page.locator('video').count();
    console.log(`Frame 3 (400ms): video count = ${videoCount3}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'hero_transition_frame3_400ms.png') });

    // Wait for transition lock to release (400ms)
    await page.waitForTimeout(600);

    // Mock video element readiness and reveal player controls
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) {
        Object.defineProperty(v, 'duration', { value: 120, configurable: true });
        v.dispatchEvent(new Event('loadedmetadata'));
        v.dispatchEvent(new Event('canplay'));
        v.dispatchEvent(new Event('playing'));
      }
      window.__playerStore?.getState?.()?.setControlsVisible(true);
    });

    await page.waitForSelector('[data-testid="player-volume-slider"]', { timeout: 8000 });
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'android_player_controls_75inch.png') });
    console.log('Captured player controls with custom volume slider!');

    // Return to gallery
    await page.locator('[data-testid="player-back-button"]').click();
    await page.waitForSelector('[data-testid="gallery-screen"]', { timeout: 5000 });

    // Open Admin Panel via 2s hotspot at (40, 40)
    await page.mouse.move(40, 40);
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await page.mouse.up();

    await page.waitForSelector('[data-testid="admin-panel-screen"]', { timeout: 5000 });

    // Click Run Diagnostics button
    const runDiagBtn = page.locator('[data-testid="admin-run-diagnostics-button"]');
    await runDiagBtn.click();
    await page.waitForSelector('[data-testid="admin-diagnostics-report"]', { timeout: 5000 });
    console.log('Diagnostics report generated!');

    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'admin_diagnostics_report.png') });
    console.log('Captured admin diagnostics report evidence!');

  } finally {
    await browser.close();
    preview.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
