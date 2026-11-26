import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeFolderChangeFlow } from '../renderer/src/services/folderChange';
import { IdleTimerService } from '../renderer/src/services/IdleTimerService';
import { bridge } from '../renderer/src/services/bridge';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { usePlayerStore } from '../renderer/src/stores/playerStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import type { ScanResult } from '../renderer/src/types';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    platform: 'windows',
    logClientMessage: vi.fn().mockResolvedValue(undefined),
    validateMediaFolder: vi.fn().mockImplementation(async (p: string) => {
      if (p.includes('invalid') || p.includes('missing')) {
        throw new Error('Directory does not exist');
      }
      return p;
    }),
    setMediaRoot: vi.fn().mockImplementation(async (path: string) => ({
      kiosk_media_root: path,
      idle_timeout_seconds: 60,
      controls_auto_hide_seconds: 4,
      slideshow_mode: 'screensaver',
      screensaver_sound: true,
      cards_per_page: 12,
      sfx_enabled: true,
      return_to_gallery_on_end: true,
    })),
    getMediaItems: vi.fn(),
  },
}));

const mockScanResult: ScanResult = {
  items: [
    {
      id: 'clip-1',
      filename: 'clip1.mp4',
      display_title: 'Clip 1',
      video_path: 'C:/NewMedia/clip1.mp4',
      thumbnail_path: 'C:/NewMedia/clip1.png',
      video_url: 'http://kiosk-media.localhost/clip1.mp4',
      thumbnail_url: 'http://kiosk-media.localhost/clip1.png',
      file_size: 1000,
    },
  ],
  screensaver: null,
  ignored_orphan_count: 0,
  video_count: 1,
  image_count: 1,
  errors: [],
  root: 'C:/NewMedia',
};

describe('executeFolderChangeFlow (BT-24 / P6-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    usePlayerStore.getState().reset();
    useSettingsStore.getState().reset();

    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK'); // Start in GALLERY

    vi.mocked(bridge.getMediaItems).mockResolvedValue(mockScanResult);
    vi.spyOn(IdleTimerService, 'stop');
    vi.spyOn(IdleTimerService, 'start');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('executes atomic flow: validates, stops player, cancels timer, updates root, rescans to GALLERY', async () => {
    expect(useApplicationStore.getState().state).toBe('GALLERY');

    const result = await executeFolderChangeFlow('C:/NewMedia');

    expect(result.success).toBe(true);
    expect(bridge.validateMediaFolder).toHaveBeenCalledWith('C:/NewMedia');
    expect(IdleTimerService.stop).toHaveBeenCalled();
    expect(useSettingsStore.getState().config.kiosk_media_root).toBe('C:/NewMedia');
    expect(useMediaStore.getState().items).toHaveLength(1);
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('stops active player and clears selection when folder changes during playback', async () => {
    // Put app in INDIVIDUAL_PLAYER state with an active playing clip
    useApplicationStore.getState().dispatch('SELECT_MEDIA');
    usePlayerStore.getState().selectMedia('old-clip-99');
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
    expect(usePlayerStore.getState().selectedMediaId).toBe('old-clip-99');
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    const result = await executeFolderChangeFlow('C:/NewMedia');

    expect(result.success).toBe(true);
    // Player must be stopped and selection cleared
    expect(usePlayerStore.getState().selectedMediaId).toBeNull();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    // Returns cleanly to GALLERY
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('recovers cleanly when folder changes during slideshow', async () => {
    // Put app in SLIDESHOW state
    useApplicationStore.getState().dispatch('IDLE_TIMEOUT');
    expect(useApplicationStore.getState().state).toBe('SLIDESHOW');

    const result = await executeFolderChangeFlow('C:/NewMedia');

    expect(result.success).toBe(true);
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('rejects invalid target folder and preserves current state without side effects', async () => {
    const prevState = useApplicationStore.getState().state;
    const prevRoot = useSettingsStore.getState().config.kiosk_media_root;

    const result = await executeFolderChangeFlow('C:/missing/directory');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Directory does not exist');
    // Root and state must be unchanged
    expect(useSettingsStore.getState().config.kiosk_media_root).toBe(prevRoot);
    expect(useApplicationStore.getState().state).toBe(prevState);
  });

  it('transitions to ERROR state if disk scan fails after root update', async () => {
    vi.mocked(bridge.getMediaItems).mockRejectedValueOnce(new Error('I/O read error'));

    const result = await executeFolderChangeFlow('C:/NewMedia');

    expect(result.success).toBe(false);
    expect(useApplicationStore.getState().state).toBe('ERROR');
    expect(useApplicationStore.getState().errorReason).toContain('I/O read error');
  });
});
