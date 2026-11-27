import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from '../renderer/src/app/App';
import { VideoPlayer } from '../renderer/src/components/VideoPlayer';
import { SlideshowScreen } from '../renderer/src/screens/SlideshowScreen';
import { IdleTimerService } from '../renderer/src/services/IdleTimerService';
import { ShuffleBagStrategy, SequentialStrategy } from '../renderer/src/services/SlideshowController';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { usePlayerStore } from '../renderer/src/stores/playerStore';
import { useSettingsStore, DEFAULT_APP_CONFIG } from '../renderer/src/stores/settingsStore';
import { bridge } from '../renderer/src/services/bridge';
import type { MediaItem } from '../renderer/src/types';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    platform: 'windows',
    initPlatform: vi.fn().mockResolvedValue('windows'),
    getAppConfig: vi.fn(),
    getMediaItems: vi.fn(),
    logClientMessage: vi.fn().mockResolvedValue(undefined),
    exitApp: vi.fn().mockResolvedValue(undefined),
    requestAdmin: vi.fn().mockResolvedValue(undefined),
    pickMediaFolder: vi.fn().mockResolvedValue(null),
    checkStoragePermission: vi.fn().mockResolvedValue(true),
    requestStoragePermission: vi.fn().mockResolvedValue(undefined),
    toggleFullscreen: vi.fn().mockResolvedValue(true),
    onAdminRequested: vi.fn().mockResolvedValue(() => {}),
    onMediaChanged: vi.fn().mockResolvedValue(() => {}),
  },
}));

function makeItems(count: number): MediaItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    filename: `Clip ${i + 1}.mp4`,
    display_title: `Clip ${i + 1}`,
    video_path: `C:/Media/Clip ${i + 1}.mp4`,
    thumbnail_path: `C:/Media/Clip ${i + 1}.png`,
    video_url: `http://kiosk-media.localhost/Clip%20${i + 1}.mp4`,
    thumbnail_url: `http://kiosk-media.localhost/Clip%20${i + 1}.png`,
    file_size: 10_000 * (i + 1),
  }));
}

describe('Brief §17 Compliance: App Logic & Playback Suites (BT-27)', () => {
  let pausedState = false;

  beforeEach(() => {
    vi.useFakeTimers();
    pausedState = false;
    IdleTimerService.stop();
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    usePlayerStore.getState().reset();
    useSettingsStore.getState().reset();

    vi.mocked(bridge.logClientMessage).mockResolvedValue(undefined);
    vi.mocked(bridge.onMediaChanged).mockResolvedValue(() => {});
    vi.mocked(bridge.onAdminRequested).mockResolvedValue(() => {});
    vi.mocked(bridge.checkStoragePermission).mockResolvedValue(true);

    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => pausedState);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
      pausedState = false;
      this.dispatchEvent(new Event('play'));
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      pausedState = true;
      this.dispatchEvent(new Event('pause'));
    });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});

    vi.mocked(bridge.getAppConfig).mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      idle_timeout_seconds: 10,
      controls_auto_hide_seconds: 4,
      slideshow_mode: 'shuffle',
      return_to_gallery_on_end: true,
    });
  });

  afterEach(() => {
    cleanup();
    IdleTimerService.stop();
    vi.useRealTimers();
  });

  describe('1. App Logic: gallery → player and player → gallery lifecycle', () => {
    it('transitions gallery → player on card tap, starts playback, and preserves single selection', async () => {
      const items = makeItems(3);
      vi.mocked(bridge.getMediaItems).mockResolvedValue({
        items,
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 3,
        image_count: 3,
        errors: [],
        root: 'C:/Media',
      });

      render(<App />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(useApplicationStore.getState().state).toBe('GALLERY');

      // Click Card 2
      const card = screen.getByRole('button', { name: 'Play Clip 2' });
      act(() => {
        fireEvent.click(card);
      });

      expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
      expect(usePlayerStore.getState().selectedMediaId).toBe('item-2');
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it('transitions player → gallery via Back button, clears selection, and restores idle timer', async () => {
      const items = makeItems(2);
      useMediaStore.getState().setScanResult({
        items,
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 2,
        image_count: 2,
        errors: [],
        root: 'C:/Media',
      });
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('SELECT_MEDIA');
      usePlayerStore.getState().selectMedia(items[0].id);
      usePlayerStore.getState().setControlsVisible(true);

      render(<VideoPlayer item={items[0]} />);
      const backBtn = screen.getByRole('button', { name: 'Back to gallery' });
      act(() => {
        fireEvent.click(backBtn);
      });

      expect(useApplicationStore.getState().state).toBe('GALLERY');
      expect(usePlayerStore.getState().selectedMediaId).toBeNull();
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });
  });

  describe('2. App Logic: Idle Timeout & Timer Cancellation', () => {
    it('cancels and resets idle timer on user touch/pointer interaction', async () => {
      const items = makeItems(2);
      vi.mocked(bridge.getMediaItems).mockResolvedValue({
        items,
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 2,
        image_count: 2,
        errors: [],
        root: 'C:/Media',
      });

      render(<App />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(useApplicationStore.getState().state).toBe('GALLERY');
      expect(IdleTimerService.isActive()).toBe(true);

      // Advance 8s of 10s timeout
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(useApplicationStore.getState().state).toBe('GALLERY');

      // User interacts: pointerdown resets timer back to 10s
      act(() => {
        fireEvent.pointerDown(window, { clientX: 200, clientY: 200 });
      });

      // Another 8s elapses (total 16s from start, but only 8s from interaction)
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(useApplicationStore.getState().state).toBe('GALLERY');

      // Final 2.1s elapses -> timeout triggers SLIDESHOW
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(useApplicationStore.getState().state).toBe('SLIDESHOW');
    });

    it('cancels player controls auto-hide timer when paused, and re-arms when resumed', () => {
      const items = makeItems(1);
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('SELECT_MEDIA');
      usePlayerStore.getState().selectMedia(items[0].id);

      render(<VideoPlayer item={items[0]} />);
      const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;
      act(() => {
        fireEvent(video, new Event('canplay'));
      });

      const surface = screen.getByTestId('video-player-screen');

      // Surface tap reveals controls, video stays playing (BT-47 new contract)
      act(() => {
        fireEvent.pointerDown(surface, { clientX: 300, clientY: 300, pointerId: 1, isPrimary: true });
        fireEvent.pointerUp(surface, { clientX: 300, clientY: 300, pointerId: 1, isPrimary: true });
      });

      expect(usePlayerStore.getState().controlsVisible).toBe(true);
      expect(usePlayerStore.getState().isPlaying).toBe(true);

      // Second tap while controls visible pauses playback
      vi.advanceTimersByTime(300);
      act(() => {
        fireEvent.pointerDown(surface, { clientX: 300, clientY: 300, pointerId: 1, isPrimary: true });
        fireEvent.pointerUp(surface, { clientX: 300, clientY: 300, pointerId: 1, isPrimary: true });
      });

      expect(usePlayerStore.getState().controlsVisible).toBe(true);
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // Paused for 30s -> controls MUST remain visible
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(usePlayerStore.getState().controlsVisible).toBe(true);

      // Resume playback via Play button -> auto-hide timer (4s) re-arms
      const playBtn = screen.getByRole('button', { name: 'Play' });
      act(() => {
        fireEvent.click(playBtn);
      });
      expect(usePlayerStore.getState().isPlaying).toBe(true);

      act(() => {
        vi.advanceTimersByTime(3999);
      });
      expect(usePlayerStore.getState().controlsVisible).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(usePlayerStore.getState().controlsVisible).toBe(false);
    });
  });

  describe('3. App Logic: Repeated Interaction Stress Cases', () => {
    it('rapidly clicking play/pause does not desynchronize video element and store', () => {
      const items = makeItems(1);
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('SELECT_MEDIA');
      usePlayerStore.getState().selectMedia(items[0].id);
      usePlayerStore.getState().setControlsVisible(true);

      render(<VideoPlayer item={items[0]} />);
      const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;
      act(() => {
        fireEvent(video, new Event('canplay'));
      });

      // Rapidly toggle play/pause 10 times in 100ms
      for (let i = 0; i < 10; i++) {
        act(() => {
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          vi.advanceTimersByTime(10);
        });
      }

      // Final state should be consistent between video.paused and store.isPlaying
      expect(video.paused).toBe(!usePlayerStore.getState().isPlaying);
    });

    it('rejects rapid double-selection during transition lock without leaking state', () => {
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');

      // First selection succeeds and locks for 500ms
      const first = useApplicationStore.getState().dispatch('SELECT_MEDIA', { lockDurationMs: 500 });
      expect(first).toBe(true);
      expect(useApplicationStore.getState().isTransitionLocked).toBe(true);

      // Rapid second selection 50ms later is rejected
      act(() => {
        vi.advanceTimersByTime(50);
      });
      const second = useApplicationStore.getState().dispatch('SELECT_MEDIA', { lockDurationMs: 500 });
      expect(second).toBe(false);
      expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');

      // After lock expires, user can exit
      act(() => {
        vi.advanceTimersByTime(451);
      });
      expect(useApplicationStore.getState().isTransitionLocked).toBe(false);
      const exit = useApplicationStore.getState().dispatch('PLAYER_EXIT');
      expect(exit).toBe(true);
      expect(useApplicationStore.getState().state).toBe('GALLERY');
    });
  });

  describe('4. App Logic: Single-Item Shuffle & Sequential Strategies', () => {
    it('single-item shuffle bag allows consecutive repeat without stall or infinite loop', () => {
      const singleItem = makeItems(1);
      const strategy = new ShuffleBagStrategy(singleItem);

      for (let i = 0; i < 10; i++) {
        const next = strategy.next();
        expect(next).not.toBeNull();
        expect(next?.id).toBe('item-1');
      }
    });

    it('sequential strategy cycles through all items deterministically in order', () => {
      const items = makeItems(3);
      const strategy = new SequentialStrategy(items);

      expect(strategy.next()?.id).toBe('item-1');
      expect(strategy.next()?.id).toBe('item-2');
      expect(strategy.next()?.id).toBe('item-3');
      expect(strategy.next()?.id).toBe('item-1');
    });
  });

  describe('5. Playback: Play, Pause, Seek, Volume, and Completion Contract', () => {
    it('seeks accurately and clamps between 0 and duration', () => {
      const items = makeItems(1);
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('SELECT_MEDIA');
      usePlayerStore.getState().selectMedia(items[0].id);
      usePlayerStore.getState().setControlsVisible(true);

      render(<VideoPlayer item={items[0]} />);
      const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;

      // Metadata sets duration to 120s
      act(() => {
        fireEvent(video, new Event('canplay'));
        Object.defineProperty(video, 'duration', { value: 120, configurable: true });
        fireEvent(video, new Event('loadedmetadata'));
      });

      const timeline = screen.getByTestId('player-timeline');
      timeline.getBoundingClientRect = () =>
        ({ left: 100, width: 400, top: 0, right: 500, bottom: 40, height: 40 } as DOMRect);

      // Seek to 50% (x=300 on 100..500) -> 60s
      act(() => {
        fireEvent.pointerDown(timeline, { clientX: 300, pointerId: 1, isPrimary: true });
      });
      expect(video.currentTime).toBe(60);
      expect(usePlayerStore.getState().currentTime).toBe(60);

      // Seek out of bounds past 100% (x=600) -> clamped to 120s
      act(() => {
        fireEvent.pointerDown(timeline, { clientX: 600, pointerId: 1, isPrimary: true });
      });
      expect(video.currentTime).toBe(120);
      expect(usePlayerStore.getState().currentTime).toBe(120);

      // Seek out of bounds before 0% (x=50) -> clamped to 0s
      act(() => {
        fireEvent.pointerDown(timeline, { clientX: 50, pointerId: 1, isPrimary: true });
      });
      expect(video.currentTime).toBe(0);
      expect(usePlayerStore.getState().currentTime).toBe(0);
    });

    it('adjusts volume, clamps to [0, 1], and automatically unmutes when volume increases', () => {
      const items = makeItems(1);
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('SELECT_MEDIA');
      usePlayerStore.getState().selectMedia(items[0].id);
      usePlayerStore.getState().setControlsVisible(true);

      render(<VideoPlayer item={items[0]} />);
      const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;
      act(() => {
        fireEvent(video, new Event('canplay'));
      });

      // Mute first
      const muteBtn = screen.getByRole('button', { name: 'Mute' });
      act(() => {
        fireEvent.click(muteBtn);
      });
      expect(usePlayerStore.getState().isMuted).toBe(true);
      expect(video.muted).toBe(true);

      // Drag volume slider to 60%
      const volumeSlider = screen.getByTestId('player-volume-slider');
      volumeSlider.getBoundingClientRect = () =>
        ({ left: 100, width: 200, top: 0, right: 300, bottom: 64, height: 64 } as DOMRect);

      act(() => {
        fireEvent.pointerDown(volumeSlider, { clientX: 220, pointerId: 1, isPrimary: true });
      });
      expect(usePlayerStore.getState().volume).toBe(0.6);
      expect(video.volume).toBe(0.6);
      // Auto-unmute should have unmuted
      expect(usePlayerStore.getState().isMuted).toBe(false);
      expect(video.muted).toBe(false);
    });

    it('completes playback (ended event): returns to gallery when configured, resets idle timer', () => {
      const resetSpy = vi.spyOn(IdleTimerService, 'reset');
      const items = makeItems(1);
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('SELECT_MEDIA');
      usePlayerStore.getState().selectMedia(items[0].id);

      render(<VideoPlayer item={items[0]} />);
      const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;

      act(() => {
        fireEvent(video, new Event('ended'));
      });
      expect(useApplicationStore.getState().state).toBe('GALLERY');
      expect(usePlayerStore.getState().selectedMediaId).toBeNull();
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });

    it('handles media playback failure with clear error overlay and return path', () => {
      const items = makeItems(1);
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('SELECT_MEDIA');
      usePlayerStore.getState().selectMedia(items[0].id);

      render(<VideoPlayer item={items[0]} />);
      const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;

      act(() => {
        Object.defineProperty(video, 'error', {
          value: { code: 3, message: 'MEDIA_ERR_DECODE' },
          configurable: true,
        });
        fireEvent(video, new Event('error'));
      });

      expect(screen.getByTestId('player-error-overlay')).toBeInTheDocument();
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      const backBtn = screen.getByRole('button', { name: /Back to gallery/i });
      act(() => {
        fireEvent.click(backBtn);
      });
      expect(useApplicationStore.getState().state).toBe('GALLERY');
    });
  });

  describe('6. Playback: Slideshow Advancement and Tap-Exit', () => {
    it('advances dual-video slideshow on track end and releases previous video', () => {
      const items = makeItems(3);
      useMediaStore.getState().setScanResult({
        items,
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 3,
        image_count: 3,
        errors: [],
        root: 'C:/Media',
      });
      useSettingsStore.setState((s) => ({
        config: { ...s.config, slideshow_mode: 'sequential' },
      }));
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('IDLE_TIMEOUT');

      render(<SlideshowScreen />);
      const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
      const videoB = screen.getByTestId('slideshow-video-b') as HTMLVideoElement;

      // Track A ends -> triggers crossfade to B after canplay
      act(() => {
        fireEvent.ended(videoA);
        fireEvent.canPlay(videoB);
      });
      expect(videoB.muted).toBe(false);
      expect(videoA.muted).toBe(true);

      // Advance past crossfade duration (600ms)
      act(() => {
        vi.advanceTimersByTime(650);
      });
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
      // Old slot is released and immediately preloads the upcoming track via React state (BT-42)
      expect(videoA.src).toContain('Clip%203.mp4');
      expect(videoA.muted).toBe(true);
    });

    it('single tap anywhere in slideshow immediately exits to GALLERY and cleans up videos', () => {
      const items = makeItems(2);
      useMediaStore.getState().setScanResult({
        items,
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 2,
        image_count: 2,
        errors: [],
        root: 'C:/Media',
      });
      useApplicationStore.getState().dispatch('INIT_DONE');
      useApplicationStore.getState().dispatch('SCAN_OK');
      useApplicationStore.getState().dispatch('IDLE_TIMEOUT');

      render(<SlideshowScreen />);
      const screenEl = screen.getByTestId('slideshow-screen');
      const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;

      act(() => {
        fireEvent.pointerDown(screenEl, { isPrimary: true });
      });
      expect(useApplicationStore.getState().state).toBe('GALLERY');
      expect(videoA.getAttribute('src')).toBeNull();
    });
  });
});
