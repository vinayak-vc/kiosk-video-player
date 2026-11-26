import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SlideshowScreen } from '../renderer/src/screens/SlideshowScreen';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import type { MediaItem, ScreensaverInfo } from '../renderer/src/types';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    platform: 'windows',
    logClientMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

const sampleItems: MediaItem[] = [
  {
    id: 'v1',
    filename: 'v1.mp4',
    display_title: 'Video 1',
    video_path: 'C:/Media/v1.mp4',
    thumbnail_path: 'C:/Media/v1.png',
    video_url: 'http://kiosk-media.localhost/v1.mp4',
    thumbnail_url: 'http://kiosk-media.localhost/v1.png',
    file_size: 1000,
  },
  {
    id: 'v2',
    filename: 'v2.mp4',
    display_title: 'Video 2',
    video_path: 'C:/Media/v2.mp4',
    thumbnail_path: 'C:/Media/v2.png',
    video_url: 'http://kiosk-media.localhost/v2.mp4',
    thumbnail_url: 'http://kiosk-media.localhost/v2.png',
    file_size: 2000,
  },
];

const sampleScreensaver: ScreensaverInfo = {
  video_path: 'C:/Media/Screensaver.mp4',
  video_url: 'http://kiosk-media.localhost/Screensaver.mp4',
  file_size: 5000,
};

describe('SlideshowScreen (P5-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    useSettingsStore.getState().reset();

    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK');
    useApplicationStore.getState().dispatch('IDLE_TIMEOUT');

    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders a single looping <video> in screensaver mode and restarts on ended fallback', () => {
    useMediaStore.getState().setScanResult({
      items: sampleItems,
      screensaver: sampleScreensaver,
      ignored_orphan_count: 0,
      video_count: 2,
      image_count: 2,
      errors: [],
      root: 'C:/Media',
    });

    render(<SlideshowScreen />);
    const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
    expect(screen.queryByTestId('slideshow-video-b')).toBeNull();
    expect(videoA.src).toContain('Screensaver.mp4');
    expect(videoA.loop).toBe(true);
    expect(videoA.muted).toBe(false);

    // Fallback restart if 'ended' fires despite loop attribute
    videoA.currentTime = 12;
    fireEvent.ended(videoA);
    expect(videoA.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('uses dual A/B <video> elements in shuffle mode, keeps only active audible, and releases old video', () => {
    useSettingsStore.setState((s) => ({
      config: { ...s.config, slideshow_mode: 'shuffle' },
    }));
    useMediaStore.getState().setScanResult({
      items: sampleItems,
      screensaver: sampleScreensaver,
      ignored_orphan_count: 0,
      video_count: 2,
      image_count: 2,
      errors: [],
      root: 'C:/Media',
    });

    render(<SlideshowScreen />);
    const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
    const videoB = screen.getByTestId('slideshow-video-b') as HTMLVideoElement;
    expect(videoA.muted).toBe(false);
    expect(videoB.muted).toBe(true);

    // Advance when A ends -> switches to B and releases A after crossfade
    fireEvent.ended(videoA);
    expect(videoA.muted).toBe(true);
    expect(videoB.muted).toBe(false);

    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(videoA.getAttribute('src')).toBeNull();
  });

  it('releases video elements and transitions back to GALLERY on single tap anywhere', () => {
    useMediaStore.getState().setScanResult({
      items: sampleItems,
      screensaver: sampleScreensaver,
      ignored_orphan_count: 0,
      video_count: 2,
      image_count: 2,
      errors: [],
      root: 'C:/Media',
    });

    render(<SlideshowScreen />);
    const container = screen.getByTestId('slideshow-screen');
    const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;

    fireEvent.pointerDown(container, { isPrimary: true });
    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(videoA.getAttribute('src')).toBeNull();
  });

  it('transitions to ERROR state if all slideshow videos fail', () => {
    useSettingsStore.setState((s) => ({
      config: { ...s.config, slideshow_mode: 'sequential' },
    }));
    useMediaStore.getState().setScanResult({
      items: [sampleItems[0]],
      screensaver: null,
      ignored_orphan_count: 0,
      video_count: 1,
      image_count: 1,
      errors: [],
      root: 'C:/Media',
    });

    render(<SlideshowScreen />);
    const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
    fireEvent.error(videoA);

    expect(useApplicationStore.getState().state).toBe('ERROR');
  });
});
