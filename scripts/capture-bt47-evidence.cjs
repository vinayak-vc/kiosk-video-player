const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const EVIDENCE_DIR = path.resolve('Docs/evidence');
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const VALID_MP4_BASE64 =
  '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';

function getPlayableMp4Buffer() {
  const local60s = path.resolve('test-fixtures/tiny_60s.mp4');
  if (fs.existsSync(local60s)) {
    return fs.readFileSync(local60s);
  }
  return Buffer.from(VALID_MP4_BASE64, 'base64');
}

const items = Array.from({ length: 8 }, (_, i) => ({
  id: `clip-${i + 1}`,
  filename: `Clip ${i + 1}.mp4`,
  display_title: `Clip ${i + 1}`,
  video_path: `C:/TestMedia/Clip ${i + 1}.mp4`,
  thumbnail_path: `C:/TestMedia/Clip ${i + 1}.png`,
  video_url: `http://kiosk-media.localhost/Clip%20${i + 1}.mp4`,
  thumbnail_url: `http://kiosk-media.localhost/Clip%20${i + 1}.png`,
  file_size: 10_000 * (i + 1),
}));

async function main() {
  console.log('Starting preview server...');
  const preview = spawn('cmd.exe', ['/c', 'npm', 'run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
    cwd: path.resolve('.'),
    stdio: 'ignore',
  });

  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      hasTouch: true,
    });

    const mp4Data = getPlayableMp4Buffer();

    await context.route('**/*.png', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(VALID_PNG_BASE64, 'base64'),
      });
    });

    await context.route('**/*.mp4', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: mp4Data,
      });
    });

    await context.addInitScript(({ mockItems }) => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd) => {
          if (cmd === 'get_config') {
            return {
              kiosk_media_root: 'C:/TestMedia',
              idle_timeout_seconds: 60,
              controls_auto_hide_seconds: 10,
              slideshow_mode: 'shuffle',
              screensaver_sound: true,
              cards_per_page: 8,
              sfx_enabled: true,
              return_to_gallery_on_end: true,
            };
          }
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
              root: 'C:/TestMedia',
            };
          }
          if (cmd === 'log_client_message') return null;
          if (cmd === 'toggle_fullscreen') return true;
          if (cmd === 'exit_kiosk_app') return null;
          if (cmd === 'plugin:event|listen') return 1;
          if (cmd === 'plugin:event|unlisten') return null;
          return null;
        },
        transformCallback: (cb) => cb,
      };
    }, { mockItems: items });

    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173');
    await page.waitForSelector('[data-testid="gallery-screen"]');

    // Click on Card 1 to enter individual player
    const card1 = page.getByRole('button', { name: 'Play Clip 1' });
    await card1.click();

    const playerScreen = page.locator('[data-testid="video-player-screen"]');
    await playerScreen.waitFor({ state: 'visible' });

    // Wait for video element
    await page.waitForSelector('video');

    // Tap blank surface to reveal controls (if hidden)
    await playerScreen.tap({ position: { x: 500, y: 300 } });
    await page.waitForTimeout(350);

    // Tap blank surface again while visible to pause playback (so center play button appears)
    await playerScreen.tap({ position: { x: 500, y: 300 } });
    await page.waitForTimeout(400);

    const centerBtn = page.locator('[data-testid="center-play-indicator"]');
    await centerBtn.waitFor({ state: 'visible' });

    // Measure bounding box of the center play overlay button
    const box = await centerBtn.boundingBox();
    if (!box) {
      throw new Error('Center play button bounding box not found!');
    }

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    console.log(`=== BT-47 Play Overlay Centering ===`);
    console.log(`Center Play Button Box: x=${box.x.toFixed(1)}, y=${box.y.toFixed(1)}, w=${box.width.toFixed(1)}, h=${box.height.toFixed(1)}`);
    console.log(`Overlay Center Point: (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
    console.log(`Target Center Point: (960.0, 540.0)`);
    console.log(`Offset from Stage Center: deltaX=${(centerX - 960).toFixed(1)}px, deltaY=${(centerY - 540).toFixed(1)}px`);

    // Measure controls touch targets
    const measurements = await page.evaluate(() => {
      const playBtn = document.querySelector('button[aria-label="Play"], button[aria-label="Pause"]');
      const backBtn = document.querySelector('[data-testid="player-back-button"]');
      const volSlider = document.querySelector('[data-testid="player-volume-slider"]');
      const bottomBar = document.querySelector('[data-testid="player-controls-overlay"] > div:last-child');
      const centerBtn = document.querySelector('[data-testid="center-play-indicator"]');

      const getDims = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      };

      return {
        centerIndicator: getDims(centerBtn),
        bottomPlayBtn: getDims(playBtn),
        backBtn: getDims(backBtn),
        volumeSlider: getDims(volSlider),
        bottomBar: getDims(bottomBar),
      };
    });

    console.log('=== BT-47 Control Touch Targets ===');
    console.log(JSON.stringify(measurements, null, 2));

    // Capture screenshots
    const centerShotPath = path.join(EVIDENCE_DIR, 'player_centered_play_button.png');
    await page.screenshot({ path: centerShotPath });
    console.log(`Saved screenshot: ${centerShotPath}`);

    const shrunkShotPath = path.join(EVIDENCE_DIR, 'player_controls_shrunk.png');
    await page.screenshot({ path: shrunkShotPath });
    console.log(`Saved screenshot: ${shrunkShotPath}`);

  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
