import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Fallback playable 1-second 64x64 H.264 MP4 container (2,239 bytes)
const VALID_MP4_BASE64 =
  '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';

function getPlayableMp4Buffer(): Buffer {
  const local60s = path.resolve('test-fixtures/tiny_60s.mp4');
  if (fs.existsSync(local60s)) {
    return fs.readFileSync(local60s);
  }
  return Buffer.from(VALID_MP4_BASE64, 'base64');
}

// 12 mock items so we exceed cards_per_page (8) for pagination testing
const MOCK_ITEMS = Array.from({ length: 12 }, (_, i) => ({
  id: `clip-${i + 1}`,
  filename: `Clip ${i + 1}.mp4`,
  display_title: `Clip ${i + 1}`,
  video_path: `C:/TestMedia/Clip ${i + 1}.mp4`,
  thumbnail_path: `C:/TestMedia/Clip ${i + 1}.png`,
  video_url: `http://kiosk-media.localhost/Clip%20${i + 1}.mp4`,
  thumbnail_url: `http://kiosk-media.localhost/Clip%20${i + 1}.png`,
  file_size: 10_000 * (i + 1),
}));

const DEFAULT_CONFIG = {
  kiosk_media_root: 'C:/TestMedia',
  idle_timeout_seconds: 60,
  controls_auto_hide_seconds: 4,
  slideshow_mode: 'shuffle',
  screensaver_sound: true,
  cards_per_page: 8,
  sfx_enabled: true,
  return_to_gallery_on_end: true,
};

async function setupKioskPage(page: import('@playwright/test').Page, configOverrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const mp4Data = getPlayableMp4Buffer();

  // Intercept media URLs so <img> and <video> elements resolve without network errors
  await page.route('**/*.png', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(VALID_PNG_BASE64, 'base64'),
    });
  });

  await page.route('**/*.mp4', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'video/mp4',
      body: mp4Data,
    });
  });

  // Mock Tauri IPC bridge
  await page.addInitScript(
    ({ mockItems, appConfig }) => {
      (window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          if (cmd === 'get_config') return appConfig;
          if (cmd === 'get_platform') return 'windows';
          if (cmd === 'check_storage_permission') return true;
          if (cmd === 'get_media_items') {
            return {
              items: mockItems,
              screensaver: null,
              ignored_orphan_count: 3,
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
        transformCallback: (cb: any) => cb,
      };
    },
    { mockItems: MOCK_ITEMS, appConfig: config }
  );

  await page.goto('/');
  await expect(page.locator('[data-testid="gallery-screen"]')).toBeVisible({ timeout: 10000 });
}

test.describe('Kiosk Video Player E2E Integration Suites (BT-28)', () => {
  test('1. Gallery rendering and pagination (>8 items)', async ({ page }) => {
    await setupKioskPage(page, { cards_per_page: 8 });

    // Page 1 should display 8 items (Clip 1 to Clip 8)
    await expect(page.getByText('Clip 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Clip 8', { exact: true })).toBeVisible();
    await expect(page.getByText('Clip 9', { exact: true })).not.toBeVisible();

    // Check pagination controls
    const nextBtn = page.getByRole('button', { name: 'Next page' });
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Page 2 should display remaining 4 items (Clip 9 to Clip 12)
    await expect(page.getByText('Clip 9', { exact: true })).toBeVisible();
    await expect(page.getByText('Clip 12', { exact: true })).toBeVisible();
    await expect(page.getByText('Clip 1', { exact: true })).not.toBeVisible();

    // Navigate back to Page 1
    const prevBtn = page.getByRole('button', { name: 'Previous page' });
    await expect(prevBtn).toBeVisible();
    await prevBtn.click();

    await expect(page.getByText('Clip 1', { exact: true })).toBeVisible();
  });

  test('2. Gallery → Player → Back to gallery and video completion lifecycle', async ({ page }) => {
    await setupKioskPage(page);

    // Click on Card 1
    const card1 = page.getByRole('button', { name: 'Play Clip 1' });
    await expect(card1).toBeVisible();
    await card1.click();

    // Enters INDIVIDUAL_PLAYER screen
    const playerScreen = page.locator('[data-testid="video-player-screen"]');
    await expect(playerScreen).toBeVisible();

    const videoEl = page.locator('[data-testid="kiosk-video-element"]');
    await expect(videoEl).toBeVisible();

    // Click Back to gallery button
    await page.locator('[data-testid="video-player-screen"]').tap();
    const backBtn = page.getByRole('button', { name: 'Back to gallery' });
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Returns to gallery
    await expect(page.locator('[data-testid="gallery-screen"]')).toBeVisible();

    // Re-enter player and test ended event return path
    await card1.click();
    await expect(playerScreen).toBeVisible();

    // Trigger video completion (ended event)
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.dispatchEvent(new Event('ended'));
    });

    // When return_to_gallery_on_end is true, returns directly to gallery
    await expect(page.locator('[data-testid="gallery-screen"]')).toBeVisible();
  });

  test('3. Player Tap Contract (tap blank reveals; tap while visible toggles play/pause)', async ({
    page,
  }) => {
    await setupKioskPage(page, { return_to_gallery_on_end: false });

    // Enter player
    await page.getByRole('button', { name: 'Play Clip 2' }).click();
    const playerScreen = page.locator('[data-testid="video-player-screen"]');
    await expect(playerScreen).toBeVisible();

    // Wait for video element
    const videoEl = page.locator('[data-testid="kiosk-video-element"]');
    await expect(videoEl).toBeVisible();

    const controls = page.locator('[data-testid="player-controls-overlay"]');

    // (a) Tap blank video surface (x: 500, y: 300 - away from center play button and bars)
    // Reveals controls ONLY, video stays playing
    await playerScreen.tap({ position: { x: 500, y: 300 } });
    await expect(controls).toBeVisible();
    await expect.poll(async () => {
      return page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? !v.paused : false;
      });
    }).toBe(true);

    // Wait past tap debounce (250ms)
    await page.waitForTimeout(350);

    // (b) Tap blank surface again while controls visible: pauses video, controls stay visible
    await playerScreen.tap({ position: { x: 500, y: 300 } });
    await expect(controls).toBeVisible();
    await expect.poll(async () => {
      return page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.paused : false;
      });
    }).toBe(true);

    // Wait past tap debounce (250ms)
    await page.waitForTimeout(350);

    // (c) Click the bottom bar Play button inside controls: resumes playback, and controls STAY visible!
    const playBtn = page.getByRole('button', { name: 'Play', exact: true });
    await expect(playBtn).toBeVisible();
    await playBtn.click();

    // Controls must remain visible immediately after clicking Play
    await expect(controls).toBeVisible();
    await expect.poll(async () => {
      return page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? !v.paused : false;
      });
    }).toBe(true);
  });

  test('4. Idle → Slideshow transition and Tap-exit back to Gallery (BT-46 tap-through guard)', async ({ page }) => {
    // Configure a 2s idle timeout to test idle transition in real time
    await setupKioskPage(page, { idle_timeout_seconds: 2 });

    // Wait 2.5s without user interaction in gallery
    await page.waitForTimeout(2500);

    // Transitions to SLIDESHOW screen
    const slideshowScreen = page.locator('[data-testid="slideshow-screen"]');
    await expect(slideshowScreen).toBeVisible({ timeout: 5000 });

    // BT-46: Tap right over card 1's position on the screen to verify tap-through is guarded!
    await slideshowScreen.tap({ position: { x: 400, y: 350 } });

    // Immediately exits to gallery, card under finger does NOT open!
    await expect(page.locator('[data-testid="gallery-screen"]')).toBeVisible();
    await expect(page.locator('[data-testid="video-player-screen"]')).not.toBeVisible();

    // After 500ms guard expires, a subsequent tap on Card 1 DOES open the player
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Play Clip 1' }).click();
    await expect(page.locator('[data-testid="video-player-screen"]')).toBeVisible();
  });
});
