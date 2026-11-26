import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import App from '../renderer/src/app/App';
import { IdleTimerService } from '../renderer/src/services/IdleTimerService';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { usePlayerStore } from '../renderer/src/stores/playerStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import { bridge } from '../renderer/src/services/bridge';

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
    onAdminRequested: vi.fn().mockResolvedValue(() => {}),
    onMediaChanged: vi.fn().mockResolvedValue(() => {}),
  },
}));

const sampleItem = {
  id: 'v1',
  filename: 'v1.mp4',
  display_title: 'Video 1',
  video_path: 'C:/Media/v1.mp4',
  thumbnail_path: 'C:/Media/v1.png',
  video_url: 'http://kiosk-media.localhost/v1.mp4',
  thumbnail_url: 'http://kiosk-media.localhost/v1.png',
  file_size: 1024,
};

describe('IdleTimerService (P5-1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    IdleTimerService.stop();
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    usePlayerStore.getState().reset();
    useSettingsStore.getState().reset();

    vi.mocked(bridge.getAppConfig).mockResolvedValue({
      kiosk_media_root: 'C:/Media',
      idle_timeout_seconds: 10,
      controls_auto_hide_seconds: 4,
      slideshow_mode: 'screensaver',
      screensaver_sound: true,
      cards_per_page: 12,
      sfx_enabled: true,
      return_to_gallery_on_end: true,
    });
    vi.mocked(bridge.getMediaItems).mockResolvedValue({
      items: [sampleItem],
      screensaver: null,
      ignored_orphan_count: 0,
      video_count: 1,
      image_count: 1,
      errors: [],
      root: 'C:/Media',
    });
  });

  afterEach(() => {
    IdleTimerService.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('maintains a single timer: repeated start() cancels previous timer', () => {
    const first = vi.fn();
    const second = vi.fn();

    IdleTimerService.start(5, first);
    vi.advanceTimersByTime(3000);
    IdleTimerService.start(5, second);

    vi.advanceTimersByTime(3000);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('arms in GALLERY, resets on interaction, and transitions to SLIDESHOW on timeout', async () => {
    const { unmount } = render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(IdleTimerService.isActive()).toBe(true);

    // Advance 7s of 10s, then tap -> resets timer to full 10s
    act(() => {
      vi.advanceTimersByTime(7000);
      fireEvent.pointerDown(window);
    });
    expect(useApplicationStore.getState().state).toBe('GALLERY');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(useApplicationStore.getState().state).toBe('GALLERY');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(useApplicationStore.getState().state).toBe('SLIDESHOW');
    expect(IdleTimerService.isActive()).toBe(false);

    unmount();
  });

  it('suspends while player is actively playing and arms when paused', async () => {
    const { unmount } = render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      usePlayerStore.getState().selectMedia('v1');
      useApplicationStore.getState().dispatch('SELECT_MEDIA');
    });

    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(IdleTimerService.isActive()).toBe(false);

    // Even after 20s while playing, does not enter SLIDESHOW
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');

    // Pause -> timer arms; after 10s clears selection & enters SLIDESHOW
    act(() => {
      usePlayerStore.getState().setPlaying(false);
    });
    expect(IdleTimerService.isActive()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(useApplicationStore.getState().state).toBe('SLIDESHOW');
    expect(usePlayerStore.getState().selectedMediaId).toBeNull();

    unmount();
    expect(IdleTimerService.isActive()).toBe(false);
  });
});
