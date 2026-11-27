const { chromium } = require('@playwright/test');
const http = require('http');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = 'C:/React/kiosk-video-player';
const EVIDENCE_DIR = path.join(REPO_ROOT, 'Docs/evidence');
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const KIOSK_MEDIA_ROOT = 'C:/Kiosk/Media';

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function createStaticServer(port = 4173) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`Static dist server listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
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
  video_path: `${KIOSK_MEDIA_ROOT}/${name}.mp4`,
  thumbnail_path: `${KIOSK_MEDIA_ROOT}/${name}.png`,
  video_url: `http://kiosk-media.localhost/${encodeURIComponent(name)}.mp4`,
  thumbnail_url: `http://kiosk-media.localhost/${encodeURIComponent(name)}.png`,
  file_size: 150000000
}));

const screensaver = {
  id: 'screensaver-loop',
  filename: 'Screensaver',
  display_title: 'Screensaver',
  video_path: `${KIOSK_MEDIA_ROOT}/Screensaver.mp4`,
  thumbnail_path: `${KIOSK_MEDIA_ROOT}/Screensaver.png`,
  video_url: 'http://kiosk-media.localhost/Screensaver.mp4',
  thumbnail_url: 'http://kiosk-media.localhost/Screensaver.png',
  file_size: 50000000
};

async function main() {
  const server = await createStaticServer(4173);

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      hasTouch: true
    });

    await context.addInitScript((mockData) => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          if (cmd === 'get_platform') return 'windows';
          if (cmd === 'check_storage_permission') return true;
          if (cmd === 'get_config') {
            return {
              kiosk_media_root: mockData.root,
              idle_timeout_seconds: 3,
              controls_auto_hide_seconds: 3,
              slideshow_mode: 'screensaver',
              screensaver_sound: false,
              cards_per_page: 12,
              sfx_enabled: true,
              return_to_gallery_on_end: true
            };
          }
          if (cmd === 'get_media_items') {
            return {
              items: mockData.items,
              screensaver: mockData.screensaver,
              ignored_orphan_count: 0,
              video_count: 11,
              image_count: 11,
              errors: [],
              root: mockData.root
            };
          }
          if (cmd === 'log_client_message') return null;
          if (cmd === 'toggle_fullscreen') return true;
          if (cmd === 'exit_kiosk_app') return null;
          if (cmd === 'plugin:event|listen') return 1;
          if (cmd === 'plugin:event|unlisten') return null;
          return null;
        },
        transformCallback: (callback) => callback
      };
    }, { items, screensaver, root: KIOSK_MEDIA_ROOT });

    const page = await context.newPage();
    await page.route(/http:\/\/kiosk-media\.localhost\/(.+)/, async (route, request) => {
      const url = request.url();
      const rawName = url.replace('http://kiosk-media.localhost/', '');
      const decoded = decodeURIComponent(rawName);
      const filePath = path.join(KIOSK_MEDIA_ROOT, decoded);

      if (fs.existsSync(filePath) && (decoded.endsWith('.png') || decoded.endsWith('.jpg'))) {
        const body = fs.readFileSync(filePath);
        await route.fulfill({
          status: 200,
          contentType: decoded.endsWith('.png') ? 'image/png' : 'image/jpeg',
          body
        });
      } else {
        const videoBuffer = fs.readFileSync(path.join(REPO_ROOT, 'test-fixtures/tiny_60s.mp4'));
        await route.fulfill({
          status: 200,
          contentType: 'video/mp4',
          body: videoBuffer
        });
      }
    });

    console.log('Navigating to app on http://127.0.0.1:4173...');
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    
    // Wait for gallery screen to be visible
    await page.waitForSelector('[data-testid="gallery-screen"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 1. Gallery Screenshot
    const galleryPath = path.join(EVIDENCE_DIR, 'win_packaged_gallery.png');
    await page.screenshot({ path: galleryPath });
    console.log('Saved Gallery screenshot:', galleryPath, fs.statSync(galleryPath).size, 'bytes');

    // 2. Wait for idle timeout (3s) to transition to Slideshow
    console.log('Waiting for idle timeout transition into Slideshow...');
    await page.waitForSelector('[data-testid="slideshow-screen"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 3. Slideshow Screenshot
    const slideshowPath = path.join(EVIDENCE_DIR, 'win_packaged_slideshow.png');
    await page.screenshot({ path: slideshowPath });
    console.log('Saved Slideshow screenshot:', slideshowPath, fs.statSync(slideshowPath).size, 'bytes');

  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error('Error during evidence capture:', err);
  process.exit(1);
});
