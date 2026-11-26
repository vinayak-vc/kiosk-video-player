import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AdminHotspot, ADMIN_HOTSPOT_HOLD_MS } from '../renderer/src/components/AdminHotspot';
import { AdminPanelScreen } from '../renderer/src/screens/AdminPanelScreen';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import { bridge } from '../renderer/src/services/bridge';
import type { MediaItem, ScreensaverInfo } from '../renderer/src/types';

// Mock bridge methods
vi.mock('../renderer/src/services/bridge', () => {
  return {
    bridge: {
      platform: 'windows',
      pickMediaFolder: vi.fn().mockResolvedValue('C:/Picked/Media'),
      validateMediaFolder: vi.fn((path: string) => Promise.resolve(path)),
      setMediaRoot: vi.fn().mockImplementation((path: string) => Promise.resolve({
        kiosk_media_root: path,
        cards_per_page: 8,
        idle_timeout_seconds: 45,
        controls_auto_hide_seconds: 4,
        slideshow_mode: 'sequential',
        screensaver_sound: false,
        sfx_enabled: true,
      })),
      scanMediaDir: vi.fn().mockResolvedValue({
        items: [],
        screensaver: null,
        ignored_orphan_count: 0,
        video_count: 0,
        image_count: 0,
        errors: [],
        root: 'C:/Kiosk/Media',
      }),
      exitApp: vi.fn(),
      logClientMessage: vi.fn().mockResolvedValue(undefined),
      convertFileSrc: vi.fn((path: string) => `kiosk-media://${path}`),
    },
  };
});

const sampleItems: MediaItem[] = [
  {
    id: '1',
    filename: 'clip1',
    display_title: 'Futurotec Showcase clip1',
    video_path: 'C:/Kiosk/Media/clip1.mp4',
    thumbnail_path: 'C:/Kiosk/Media/clip1.png',
    video_url: 'kiosk-media://clip1.mp4',
    thumbnail_url: 'kiosk-media://clip1.png',
    file_size: 1024,
  },
  {
    id: '2',
    filename: 'clip2',
    display_title: 'Interactive VR 360 clip2',
    video_path: 'C:/Kiosk/Media/clip2.mp4',
    thumbnail_path: 'C:/Kiosk/Media/clip2.png',
    video_url: 'kiosk-media://clip2.mp4',
    thumbnail_url: 'kiosk-media://clip2.png',
    file_size: 2048,
  },
];

const sampleScreensaver: ScreensaverInfo = {
  video_path: 'C:/Kiosk/Media/screensaver.mp4',
  video_url: 'kiosk-media://screensaver.mp4',
  file_size: 4096,
};

describe('AdminHotspot (Phase 6 2s Long-Press Hidden Hotspot)', () => {
  beforeEach(() => {
    useApplicationStore.getState().reset();
    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders top-left hotspot and triggers ADMIN_OPEN on 2-second hold', () => {
    render(<AdminHotspot />);
    const hotspot = screen.getByTestId('admin-hotspot');
    expect(hotspot).toBeInTheDocument();

    fireEvent.pointerDown(window, { clientX: 50, clientY: 50, isPrimary: true });
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

    fireEvent.pointerDown(window, { clientX: 40, clientY: 40, isPrimary: true });
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    fireEvent.pointerUp(window);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('cancels timer if pointer moves outside the 120x120 hotspot area', () => {
    render(<AdminHotspot />);

    fireEvent.pointerDown(window, { clientX: 40, clientY: 40, isPrimary: true });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('does not swallow or block pointer events on elements underneath (e.g. Back button at 60,60)', () => {
    const handleBackClick = vi.fn();
    render(
      <div style={{ position: 'relative', width: 1920, height: 1080 }}>
        <button
          type="button"
          data-testid="mock-back-button"
          style={{ position: 'absolute', top: 32, left: 32, width: 64, height: 64 }}
          onClick={handleBackClick}
        >
          Back
        </button>
        <AdminHotspot />
      </div>
    );

    const backBtn = screen.getByTestId('mock-back-button');
    // Clicking or tapping Back button at (60, 60)
    fireEvent.pointerDown(backBtn, { clientX: 60, clientY: 60, isPrimary: true });
    fireEvent.click(backBtn);
    expect(handleBackClick).toHaveBeenCalledTimes(1);
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
    (bridge as unknown as { platform: string }).platform = 'windows';
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

  it('hides Browse System Folder and displays Android hint when platform is android', () => {
    (bridge as unknown as { platform: string }).platform = 'android';

    render(<AdminPanelScreen />);

    expect(screen.queryByTestId('admin-pick-folder-button')).toBeNull();
    const hint = screen.getByTestId('admin-android-hint');
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toContain('/storage/emulated/0/Kiosk/Media');
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

  it('shows android-specific exit message when on android', () => {
    (bridge as unknown as { platform: string }).platform = 'android';

    render(<AdminPanelScreen />);

    const exitBtn = screen.getByTestId('admin-exit-app-button');
    fireEvent.click(exitBtn);

    const modal = screen.getByTestId('admin-exit-modal');
    expect(modal.textContent).toContain('Android launcher');
  });
});
