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
  console.log('Building dist first...');
  const build = spawn('npm.cmd', ['run', 'build'], { stdio: 'inherit', shell: true });
  await new Promise(r => build.on('close', r));

  console.log('Starting preview server...');
  const preview = spawn('npm.cmd', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4174'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: true
  });

  await new Promise(r => setTimeout(r, 2500));

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  try {
    // 1. Gallery Heading & Admin Panel
    const context1 = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      hasTouch: true
    });

    await context1.addInitScript((mockData) => {
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
              ignored_orphan_count: 2,
              video_count: 13,
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

    const page1 = await context1.newPage();
    await page1.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
    await page1.waitForTimeout(1000);

    // Screenshot 1: Gallery Heading
    const shot1 = path.join(EVIDENCE_DIR, 'copy_gallery_heading_1080p.png');
    await page1.screenshot({ path: shot1 });
    console.log(`Saved: ${shot1}`);

    // Open Admin panel via 2-second hold in top-left
    await page1.mouse.move(40, 40);
    await page1.mouse.down();
    await page1.waitForTimeout(2200);
    await page1.mouse.up();
    await page1.waitForSelector('[data-testid="admin-panel-screen"]');
    await page1.waitForTimeout(500);

    // Screenshot 5: Admin Panel
    const shot5 = path.join(EVIDENCE_DIR, 'copy_admin_panel_1080p.png');
    await page1.screenshot({ path: shot5 });
    console.log(`Saved: ${shot5}`);

    // Click first media card to open player, trigger error overlay
    await page1.click('[data-testid="admin-close-button"]');
    await page1.waitForSelector('[data-testid="gallery-screen"]');
    await page1.waitForTimeout(500);

    // Click first card to enter player
    await page1.click('[aria-label^="Play "]');
    await page1.waitForSelector('[data-testid="video-player-screen"]');
    await page1.waitForTimeout(500);

    // Trigger video error on video element
    await page1.evaluate(() => {
      const v = document.querySelector('[data-testid="kiosk-video-element"]');
      if (v) {
        Object.defineProperty(v, 'error', { value: { code: 4, message: 'Format error' }, configurable: true });
        v.dispatchEvent(new Event('error'));
      }
    });
    await page1.waitForSelector('[data-testid="player-error-overlay"]');
    await page1.waitForTimeout(500);

    // Screenshot 4: Player Error Overlay
    const shot4 = path.join(EVIDENCE_DIR, 'copy_player_error_1080p.png');
    await page1.screenshot({ path: shot4 });
    console.log(`Saved: ${shot4}`);

    // 2. Empty State
    const contextEmpty = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      hasTouch: true
    });
    await contextEmpty.addInitScript(() => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd) => {
          if (cmd === 'get_platform') return 'windows';
          if (cmd === 'get_config') {
            return {
              kiosk_media_root: '',
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
              items: [],
              screensaver: null,
              ignored_orphan_count: 0,
              video_count: 0,
              image_count: 0,
              errors: [],
              root: ''
            };
          }
          return null;
        },
        transformCallback: (callback) => callback
      };
    });
    const pageEmpty = await contextEmpty.newPage();
    await pageEmpty.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
    await pageEmpty.waitForSelector('[data-testid="empty-screen"]');
    await pageEmpty.waitForTimeout(500);

    // Screenshot 2: Empty State
    const shot2 = path.join(EVIDENCE_DIR, 'copy_empty_state_1080p.png');
    await pageEmpty.screenshot({ path: shot2 });
    console.log(`Saved: ${shot2}`);

    // 3. Error State
    const contextError = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      hasTouch: true
    });
    await contextError.addInitScript(() => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd) => {
          if (cmd === 'get_platform') return 'windows';
          if (cmd === 'get_config') {
            return {
              kiosk_media_root: 'C:/NonExistent/Folder',
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
              items: [],
              screensaver: null,
              ignored_orphan_count: 0,
              video_count: 0,
              image_count: 0,
              errors: ["Could not read folder 'C:/NonExistent/Folder': Directory not found"],
              root: 'C:/NonExistent/Folder'
            };
          }
          return null;
        },
        transformCallback: (callback) => callback
      };
    });
    const pageError = await contextError.newPage();
    await pageError.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
    await pageError.waitForSelector('[data-testid="error-screen"]');
    await pageError.waitForTimeout(500);

    // Screenshot 3: Error State
    const shot3 = path.join(EVIDENCE_DIR, 'copy_error_state_1080p.png');
    await pageError.screenshot({ path: shot3 });
    console.log(`Saved: ${shot3}`);

  } finally {
    await browser.close();
    preview.kill();
    // Force kill port on Windows if hanging
    spawn('cmd.exe', ['/c', 'for /f "tokens=5" %a in (\'netstat -aon ^| findstr :4174\') do taskkill /f /pid %a'], { stdio: 'ignore' });
  }
}

main().catch(err => {
  console.error('Fatal in capture script:', err);
  process.exit(1);
});
