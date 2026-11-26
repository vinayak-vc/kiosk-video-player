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
  filename: name,
  display_title: name,
  video_path: `${ROOT_DIR}/${name}.mp4`,
  thumbnail_path: `${ROOT_DIR}/${name}.png`,
  video_url: `kiosk-media://${encodeURIComponent(name)}.mp4`,
  thumbnail_url: `kiosk-media://${encodeURIComponent(name)}.png`,
  file_size: 150000000
}));

async function main() {
  console.log('Starting preview server...');
  const preview = spawn('npm.cmd', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: true
  });

  // Wait for preview server to accept connections
  await new Promise(r => setTimeout(r, 2500));

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  try {
    // 1. 1080p Screen
    const context1080 = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      hasTouch: true
    });

    await context1080.addInitScript((mockData) => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          if (cmd === 'get_platform') return 'windows';
          if (cmd === 'get_config') {
            return {
              kiosk_media_root: mockData.root,
              idle_timeout_seconds: 45,
              controls_auto_hide_seconds: 4,
              slideshow_mode: 'sequential',
              screensaver_sound: false,
              cards_per_page: 8,
              sfx_enabled: true,
              return_to_gallery_on_end: true
            };
          }
          if (cmd === 'get_media_items') {
            return {
              items: mockData.items,
              screensaver: null,
              ignored_orphan_count: 0,
              video_count: 11,
              image_count: 11,
              errors: [],
              root: mockData.root
            };
          }
          if (cmd === 'log_client_message') return;
          if (cmd === 'validate_media_folder_cmd') return args.path;
          if (cmd === 'set_media_root') return args.path;
          return null;
        },
        transformCallback: (callback) => callback
      };
    }, { items, root: ROOT_DIR });

    const page = await context1080.newPage();
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });

    // Open Admin panel via 2-second hold in top-left hotspot
    await page.mouse.move(40, 40);
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await page.mouse.up();
    await page.waitForSelector('[data-testid="admin-panel-screen"]', { timeout: 5000 });

    // Select the first real Futurotec video and click Test Playback
    await page.selectOption('[data-testid="admin-test-clip-select"]', 'futurotec-1');
    await page.click('[data-testid="admin-test-play-button"]');
    await page.waitForSelector('[data-testid="admin-test-video-player"]', { timeout: 5000 });
    await page.waitForTimeout(800);

    // Capture 1080p top view
    const p1080 = path.join(EVIDENCE_DIR, 'p6_admin_panel_1080p.png');
    await page.screenshot({ path: p1080 });
    console.log(`Saved: ${p1080} (${fs.statSync(p1080).size} bytes)`);

    // Scroll to bottom of admin panel container to demonstrate finger drag / scrolling
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="admin-panel-screen"]');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
    await page.waitForTimeout(400);

    const pScrolled = path.join(EVIDENCE_DIR, 'p6_admin_panel_scrolled_1080p.png');
    await page.screenshot({ path: pScrolled });
    console.log(`Saved: ${pScrolled} (${fs.statSync(pScrolled).size} bytes)`);

    await context1080.close();

    // 2. 720p Screen
    const context720 = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      hasTouch: true
    });

    await context720.addInitScript((mockData) => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd) => {
          if (cmd === 'get_platform') return 'windows';
          if (cmd === 'get_config') {
            return {
              kiosk_media_root: mockData.root,
              idle_timeout_seconds: 45,
              controls_auto_hide_seconds: 4,
              slideshow_mode: 'sequential',
              screensaver_sound: false,
              cards_per_page: 8,
              sfx_enabled: true,
              return_to_gallery_on_end: true
            };
          }
          if (cmd === 'get_media_items') {
            return {
              items: mockData.items,
              screensaver: null,
              ignored_orphan_count: 0,
              video_count: 11,
              image_count: 11,
              errors: [],
              root: mockData.root
            };
          }
          if (cmd === 'log_client_message') return;
          return null;
        },
        transformCallback: (callback) => callback
      };
    }, { items, root: ROOT_DIR });

    const page720 = await context720.newPage();
    await page720.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await page720.mouse.move(30, 30);
    await page720.mouse.down();
    await page720.waitForTimeout(2200);
    await page720.mouse.up();
    await page720.waitForSelector('[data-testid="admin-panel-screen"]', { timeout: 5000 });
    await page720.waitForTimeout(600);

    const p720 = path.join(EVIDENCE_DIR, 'p6_admin_panel_720p.png');
    await page720.screenshot({ path: p720 });
    console.log(`Saved: ${p720} (${fs.statSync(p720).size} bytes)`);

    await context720.close();
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
