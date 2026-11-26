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

    // Advance when A ends -> switches to B after canplay and releases A after crossfade
    fireEvent.ended(videoA);
    act(() => {
      fireEvent.canPlay(videoB);
    });
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

  it('tap during 450 ms transition lock still exits slideshow (SLIDESHOW_TAP must never be lockable)', () => {
    // The slideshow is entered via IDLE_TIMEOUT dispatched with lockDurationMs=450.
    // A visitor who taps within that window must still reach GALLERY, not get a
    // permanent black screen (exitingRef stuck + videos released + dispatch rejected).
    useMediaStore.getState().setScanResult({
      items: sampleItems,
      screensaver: sampleScreensaver,
      ignored_orphan_count: 0,
      video_count: 2,
      image_count: 2,
      errors: [],
      root: 'C:/Media',
    });

    // Simulate the 450 ms lock that is set when entering the SLIDESHOW state
    useApplicationStore.getState().beginTransition(450);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);

    render(<SlideshowScreen />);
    const container = screen.getByTestId('slideshow-screen');

    // Tap at t=100ms (lock still active)
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.pointerDown(container, { isPrimary: true });

    // Must reach GALLERY — not stall on black screen
    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
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

  it('falls back to shuffle mode when screensaver video errors mid-slideshow', () => {
    useSettingsStore.setState((s) => ({
      config: { ...s.config, slideshow_mode: 'screensaver' },
    }));
    useMediaStore.getState().setScanResult({
      items: sampleItems,
      screensaver: sampleScreensaver,
      ignored_orphan_count: 0,
      video_count: 3,
      image_count: 3,
      errors: [],
      root: 'C:/Media',
    });

    render(<SlideshowScreen />);
    const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
    expect(videoA.src).toContain('Screensaver.mp4');

    // Simulate Screensaver video encountering an error mid-slideshow
    fireEvent.error(videoA);

    // Should NOT fatal error because regular items exist; should fallback to shuffle mode
    expect(useApplicationStore.getState().state).toBe('SLIDESHOW');
    const videoB = screen.getByTestId('slideshow-video-b') as HTMLVideoElement;
    expect(videoB).toBeDefined();
  });

  it('advances to shuffle track when screensaver is removed from disk mid-slideshow', () => {
    useSettingsStore.setState((s) => ({
      config: { ...s.config, slideshow_mode: 'screensaver' },
    }));
    useMediaStore.getState().setScanResult({
      items: sampleItems,
      screensaver: sampleScreensaver,
      ignored_orphan_count: 0,
      video_count: 3,
      image_count: 3,
      errors: [],
      root: 'C:/Media',
    });

    render(<SlideshowScreen />);
    const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
    expect(videoA.src).toContain('Screensaver.mp4');

    // Simulate disk change removing Screensaver.mp4
    act(() => {
      useMediaStore.setState({ screensaver: null });
    });

    // Slideshow transitions to shuffle track without crashing
    expect(useApplicationStore.getState().state).toBe('SLIDESHOW');
  });

  describe('BT-42 Slideshow Preload Contract Verification', () => {
    it('holds reserved track in INACTIVE slot React state immediately on mount (first transition preloaded before active ends)', () => {
      useSettingsStore.setState((s) => ({
        config: { ...s.config, slideshow_mode: 'sequential' },
      }));
      useMediaStore.getState().setScanResult({
        items: sampleItems,
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 2,
        image_count: 2,
        errors: [],
        root: 'C:/Media',
      });

      render(<SlideshowScreen />);
      const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
      const videoB = screen.getByTestId('slideshow-video-b') as HTMLVideoElement;

      // Slot A is active playing v1
      expect(videoA.src).toContain('v1.mp4');
      expect(videoA.muted).toBe(false);

      // Inactive Slot B has src=v2.mp4 before video A ends (preload='auto', muted, not active)
      expect(videoB.src).toContain('v2.mp4');
      expect(videoB.muted).toBe(true);
      expect(videoB.getAttribute('preload')).toBe('auto');
    });

    it('crossfades only after canplay event fires on the preloaded slot', () => {
      useSettingsStore.setState((s) => ({
        config: { ...s.config, slideshow_mode: 'sequential' },
      }));
      useMediaStore.getState().setScanResult({
        items: sampleItems,
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 2,
        image_count: 2,
        errors: [],
        root: 'C:/Media',
      });

      render(<SlideshowScreen />);
      const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
      const videoB = screen.getByTestId('slideshow-video-b') as HTMLVideoElement;

      // Active video A ends
      act(() => {
        fireEvent.ended(videoA);
      });

      // Before canplay fires, video B is not yet active/unmuted
      expect(videoB.muted).toBe(true);
      expect(videoA.muted).toBe(false);

      // canplay fires on video B -> triggers crossfade
      act(() => {
        fireEvent.canPlay(videoB);
      });
      expect(videoB.muted).toBe(false);
      expect(videoA.muted).toBe(true);

      // After 600ms crossfade, old video A is released exactly once
      act(() => {
        vi.advanceTimersByTime(650);
      });
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    });

    it('exit mid-preload cleanly releases both active and preloaded video elements', () => {
      useSettingsStore.setState((s) => ({
        config: { ...s.config, slideshow_mode: 'sequential' },
      }));
      useMediaStore.getState().setScanResult({
        items: sampleItems,
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 2,
        image_count: 2,
        errors: [],
        root: 'C:/Media',
      });

      render(<SlideshowScreen />);
      const container = screen.getByTestId('slideshow-screen');
      const videoA = screen.getByTestId('slideshow-video-a') as HTMLVideoElement;
      const videoB = screen.getByTestId('slideshow-video-b') as HTMLVideoElement;

      // Both slots have active/preloaded src
      expect(videoA.src).toContain('v1.mp4');
      expect(videoB.src).toContain('v2.mp4');

      // User taps screen mid-preload
      fireEvent.pointerDown(container, { isPrimary: true });

      // State transitions to GALLERY
      expect(useApplicationStore.getState().state).toBe('GALLERY');

      // Both video elements are paused and stripped of src
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
      expect(videoA.getAttribute('src')).toBeNull();
      expect(videoB.getAttribute('src')).toBeNull();
    });
  });
});
