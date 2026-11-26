import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AdminHotspot, ADMIN_HOTSPOT_HOLD_MS } from '../renderer/src/components/AdminHotspot';
import { AdminPanelScreen } from '../renderer/src/screens/AdminPanelScreen';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import { bridge } from '../renderer/src/services/bridge';
import type { MediaItem, ScreensaverInfo } from '../renderer/src/types';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    platform: 'windows',
    logClientMessage: vi.fn().mockResolvedValue(undefined),
    validateMediaFolder: vi.fn().mockImplementation(async (p: string) => p),
    pickMediaFolder: vi.fn().mockResolvedValue('C:/Picked/Media'),
    exitApp: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../renderer/src/services/startup', () => ({
  performMediaScan: vi.fn().mockResolvedValue(undefined),
}));

const sampleItems: MediaItem[] = [
  {
    id: 'vid-1',
    filename: 'clip1.mp4',
    display_title: 'Clip 1',
    video_path: 'C:/Media/clip1.mp4',
    thumbnail_path: 'C:/Media/clip1.png',
    video_url: 'http://kiosk-media.localhost/clip1.mp4',
    thumbnail_url: 'http://kiosk-media.localhost/clip1.png',
    file_size: 1000,
  },
  {
    id: 'vid-2',
    filename: 'clip2.mp4',
    display_title: 'Clip 2',
    video_path: 'C:/Media/clip2.mp4',
    thumbnail_path: 'C:/Media/clip2.png',
    video_url: 'http://kiosk-media.localhost/clip2.mp4',
    thumbnail_url: 'http://kiosk-media.localhost/clip2.png',
    file_size: 2000,
  },
];

const sampleScreensaver: ScreensaverInfo = {
  video_path: 'C:/Media/Screensaver.mp4',
  video_url: 'http://kiosk-media.localhost/Screensaver.mp4',
  file_size: 5000,
};

describe('AdminHotspot (2s hidden top-left touch access)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useApplicationStore.getState().reset();
    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders top-left hotspot and triggers ADMIN_OPEN on 2-second hold', () => {
    render(<AdminHotspot />);
    const hotspot = screen.getByTestId('admin-hotspot');

    fireEvent.pointerDown(hotspot, { isPrimary: true });
    expect(useApplicationStore.getState().state).toBe('GALLERY');

    // Advance 1900 ms -> still in GALLERY
    act(() => {
      vi.advanceTimersByTime(1900);
    });
    expect(useApplicationStore.getState().state).toBe('GALLERY');

    // Advance past 2000 ms -> transitions to ADMIN_PANEL
    act(() => {
      vi.advanceTimersByTime(ADMIN_HOTSPOT_HOLD_MS - 1900);
    });
    expect(useApplicationStore.getState().state).toBe('ADMIN_PANEL');
  });

  it('cancels timer if pointer is released before 2 seconds', () => {
    render(<AdminHotspot />);
    const hotspot = screen.getByTestId('admin-hotspot');

    fireEvent.pointerDown(hotspot, { isPrimary: true });
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    fireEvent.pointerUp(hotspot);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('cancels timer if pointer leaves the hotspot area', () => {
    render(<AdminHotspot />);
    const hotspot = screen.getByTestId('admin-hotspot');

    fireEvent.pointerDown(hotspot, { isPrimary: true });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.pointerLeave(hotspot);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });
});

describe('AdminPanelScreen (Phase 6 Admin & Diagnostics UI)', () => {
  beforeEach(() => {
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    useSettingsStore.getState().reset();

    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK');
    useApplicationStore.getState().dispatch('ADMIN_OPEN');

    useMediaStore.getState().setScanResult({
      items: sampleItems,
      screensaver: sampleScreensaver,
      ignored_orphan_count: 3,
      video_count: 5,
      image_count: 4,
      errors: ['Corrupted file header in bad.mp4'],
      root: 'C:/Kiosk/Media',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('displays media root, file counts, orphans, and screensaver status accurately', () => {
    render(<AdminPanelScreen />);

    expect(screen.getByTestId('admin-panel-screen')).toBeInTheDocument();
    expect(screen.getByTestId('stat-pairs-count').textContent).toBe('2');
    expect(screen.getByTestId('stat-orphans-count').textContent).toBe('3');
    expect(screen.getByTestId('stat-videos-count').textContent).toBe('5');
    expect(screen.getByTestId('stat-images-count').textContent).toBe('4');
    expect(screen.getByTestId('stat-screensaver-status').textContent).toContain('Present');
    expect(screen.getByTestId('admin-scan-errors').textContent).toContain('Corrupted file header in bad.mp4');
  });

  it('returns to GALLERY when Return to Gallery button is clicked', () => {
    render(<AdminPanelScreen />);

    const closeBtn = screen.getByTestId('admin-close-button');
    fireEvent.click(closeBtn);

    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('validates folder path using bridge.validateMediaFolder', async () => {
    render(<AdminPanelScreen />);

    const validateBtn = screen.getByTestId('admin-validate-button');
    await act(async () => {
      fireEvent.click(validateBtn);
    });

    expect(bridge.validateMediaFolder).toHaveBeenCalledWith('C:/Kiosk/Media');
    expect(screen.getByTestId('admin-feedback').textContent).toContain('Path is valid');
  });

  it('supports picking folder via native picker and rescans', async () => {
    const setMediaRootSpy = vi.spyOn(useSettingsStore.getState(), 'setMediaRoot').mockResolvedValue({
      ...useSettingsStore.getState().config,
      kiosk_media_root: 'C:/Picked/Media',
    });

    render(<AdminPanelScreen />);

    const pickBtn = screen.getByTestId('admin-pick-folder-button');
    await act(async () => {
      fireEvent.click(pickBtn);
    });

    expect(bridge.pickMediaFolder).toHaveBeenCalled();
    expect(setMediaRootSpy).toHaveBeenCalledWith('C:/Picked/Media');
  });

  it('handles test video playback: start mounts video, stop releases it', () => {
    render(<AdminPanelScreen />);

    expect(screen.queryByTestId('admin-test-video-player')).toBeNull();

    const playBtn = screen.getByTestId('admin-test-play-button');
    fireEvent.click(playBtn);

    const testVideo = screen.getByTestId('admin-test-video-player') as HTMLVideoElement;
    expect(testVideo).toBeInTheDocument();
    expect(testVideo.src).toContain('clip1.mp4');

    const stopBtn = screen.getByTestId('admin-test-stop-button');
    fireEvent.click(stopBtn);

    expect(screen.queryByTestId('admin-test-video-player')).toBeNull();
  });

  it('shows confirmation modal before invoking bridge.exitApp', () => {
    render(<AdminPanelScreen />);

    expect(screen.queryByTestId('admin-exit-modal')).toBeNull();

    const exitBtn = screen.getByTestId('admin-exit-app-button');
    fireEvent.click(exitBtn);

    expect(screen.getByTestId('admin-exit-modal')).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('admin-exit-confirm-button');
    fireEvent.click(confirmBtn);

    expect(bridge.exitApp).toHaveBeenCalled();
  });
});
