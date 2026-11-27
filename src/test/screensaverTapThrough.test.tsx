import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SlideshowScreen } from '../renderer/src/screens/SlideshowScreen';
import { GalleryScreen } from '../renderer/src/screens/GalleryScreen';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import { usePlayerStore } from '../renderer/src/stores/playerStore';
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

describe('BT-46: Screensaver Tap-Through Guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    useSettingsStore.getState().reset();
    usePlayerStore.getState().reset();

    useMediaStore.getState().setScanResult({
      items: sampleItems,
      screensaver: sampleScreensaver,
      ignored_orphan_count: 0,
      video_count: 2,
      image_count: 2,
      errors: [],
      root: 'C:/Media',
    });

    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK');

    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('swallows trailing pointerup/click and blocks card opening when tapping screensaver over a card location', () => {
    // 1. Enter SLIDESHOW
    act(() => {
      useApplicationStore.getState().dispatch('IDLE_TIMEOUT');
    });
    expect(useApplicationStore.getState().state).toBe('SLIDESHOW');

    const { unmount } = render(<SlideshowScreen />);
    const slideshowContainer = screen.getByTestId('slideshow-screen');

    // 2. User taps (press down and release) on screensaver
    act(() => {
      fireEvent.pointerDown(slideshowContainer, { isPrimary: true, clientX: 200, clientY: 200 });
      fireEvent.pointerUp(slideshowContainer, { isPrimary: true, clientX: 200, clientY: 200 });
    });

    // Slideshow transition accepted and state is now GALLERY
    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(useApplicationStore.getState().previousState).toBe('SLIDESHOW');
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);

    unmount();

    // 3. Gallery mounts under the finger
    render(<GalleryScreen />);
    const card = screen.getByLabelText('Play Video 1');
    expect(card).toBeDefined();

    // 4. Trailing pointerup/click fires on the card immediately (tap-through simulation)
    act(() => {
      fireEvent.pointerUp(card, { isPrimary: true, clientX: 200, clientY: 200 });
      fireEvent.click(card);
    });

    // Guard prevented SELECT_MEDIA! Player state must NOT have selected the media
    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(usePlayerStore.getState().selectedMediaId).toBeNull();

    // 5. Advance time past the 450ms guard window
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(useApplicationStore.getState().isTransitionLocked).toBe(false);

    // 6. Normal subsequent tap on the card DOES open it
    act(() => {
      fireEvent.click(card);
    });

    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
    expect(usePlayerStore.getState().selectedMediaId).toBe('v1');
  });
});
