import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transition,
  TRANSITION_TABLE,
  type AppEvent,
} from '../renderer/src/services/AppState';
import { executeStartup, handleMediaChangedEvent } from '../renderer/src/services/startup';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { usePlayerStore } from '../renderer/src/stores/playerStore';
import { useSettingsStore, DEFAULT_APP_CONFIG } from '../renderer/src/stores/settingsStore';
import type { ApplicationState, MediaItem, ScanResult } from '../renderer/src/types';
import { bridge } from '../renderer/src/services/bridge';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    getMediaItems: vi.fn(),
    getAppConfig: vi.fn(),
    setMediaRoot: vi.fn(),
    pickMediaFolder: vi.fn(),
    onMediaChanged: vi.fn().mockResolvedValue(() => {}),
    onAdminRequested: vi.fn().mockResolvedValue(() => {}),
    logClientMessage: vi.fn().mockResolvedValue(undefined),
    exitApp: vi.fn().mockResolvedValue(undefined),
    requestAdmin: vi.fn().mockResolvedValue(undefined),
  },
}));

const ALL_STATES: ApplicationState[] = [
  'INITIALIZING',
  'SCANNING_MEDIA',
  'GALLERY',
  'INDIVIDUAL_PLAYER',
  'SLIDESHOW',
  'ADMIN_PANEL',
  'ERROR',
];

const ALL_EVENTS: AppEvent[] = [
  'INIT_DONE',
  'SCAN_START',
  'SCAN_OK',
  'SCAN_FAIL',
  'SELECT_MEDIA',
  'VIDEO_ENDED',
  'PLAYER_EXIT',
  'IDLE_TIMEOUT',
  'SLIDESHOW_TAP',
  'ADMIN_OPEN',
  'ADMIN_CLOSE',
  'FATAL_ERROR',
  'RETRY',
];

function makeItems(count: number): MediaItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    filename: `item-${i}.mp4`,
    display_title: `Item ${i}`,
    video_path: `C:/Media/item-${i}.mp4`,
    thumbnail_path: `C:/Media/item-${i}.png`,
    video_url: `http://kiosk-media.localhost/item-${i}.mp4`,
    thumbnail_url: `http://kiosk-media.localhost/item-${i}.png`,
    file_size: 1000,
  }));
}

describe('AppState pure transition table', () => {
  it('accepts every valid edge and rejects every illegal edge', () => {
    for (const state of ALL_STATES) {
      for (const event of ALL_EVENTS) {
        const expected = TRANSITION_TABLE[state][event];
        const res = transition(state, event);
        if (expected) {
          expect(res.accepted).toBe(true);
          expect(res.nextState).toBe(expected);
        } else {
          expect(res.accepted).toBe(false);
          expect(res.nextState).toBe(state);
          expect(res.reason).toContain('Illegal transition');
        }
      }
    }
  });

  it('allows ADMIN_OPEN from GALLERY, INDIVIDUAL_PLAYER, SLIDESHOW, and ERROR', () => {
    for (const s of ['GALLERY', 'INDIVIDUAL_PLAYER', 'SLIDESHOW', 'ERROR'] as ApplicationState[]) {
      const res = transition(s, 'ADMIN_OPEN');
      expect(res.accepted).toBe(true);
      expect(res.nextState).toBe('ADMIN_PANEL');
    }
  });
});

describe('useApplicationStore transition lock & logging', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useApplicationStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks user events while locked, auto-releases, and allows double-tap only once', () => {
    const store = useApplicationStore.getState();
    expect(store.dispatch('INIT_DONE')).toBe(true);
    expect(store.dispatch('SCAN_OK')).toBe(true);

    // Rapid double-tap SELECT_MEDIA: first succeeds, second is blocked
    expect(store.dispatch('SELECT_MEDIA', { lockDurationMs: 500 })).toBe(true);
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);

    // User PLAYER_EXIT while locked is ignored
    expect(store.dispatch('PLAYER_EXIT')).toBe(false);
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');

    vi.advanceTimersByTime(499);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);

    vi.advanceTimersByTime(1);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(false);
    expect(store.dispatch('PLAYER_EXIT')).toBe(true);
    expect(useApplicationStore.getState().state).toBe('GALLERY');

    // Double-tap SELECT_MEDIA in GALLERY
    expect(store.dispatch('SELECT_MEDIA', { lockDurationMs: 400 })).toBe(true);
    expect(store.dispatch('SELECT_MEDIA', { lockDurationMs: 400 })).toBe(false);
  });

  it('never blocks system events (VIDEO_ENDED, IDLE_TIMEOUT, FATAL_ERROR, ADMIN_OPEN) during lock', () => {
    const store = useApplicationStore.getState();
    store.dispatch('INIT_DONE');
    store.dispatch('SCAN_OK');

    // VIDEO_ENDED during lock still returns to GALLERY
    store.dispatch('SELECT_MEDIA', { lockDurationMs: 500 });
    expect(store.dispatch('VIDEO_ENDED')).toBe(true);
    expect(useApplicationStore.getState().state).toBe('GALLERY');

    // IDLE_TIMEOUT during lock still reaches SLIDESHOW
    store.beginTransition(500);
    expect(store.dispatch('IDLE_TIMEOUT')).toBe(true);
    expect(useApplicationStore.getState().state).toBe('SLIDESHOW');

    // ADMIN_OPEN during lock never blocked
    store.beginTransition(500);
    expect(store.dispatch('ADMIN_OPEN')).toBe(true);
    expect(useApplicationStore.getState().state).toBe('ADMIN_PANEL');

    // FATAL_ERROR during lock never blocked
    store.beginTransition(500);
    expect(store.dispatch('FATAL_ERROR', { errorReason: 'Disk offline' })).toBe(true);
    expect(useApplicationStore.getState().state).toBe('ERROR');
  });

  it('SLIDESHOW_TAP is never blocked by transition lock (early tap must not strand on black screen)', () => {
    // The IDLE_TIMEOUT transition that enters the slideshow carries a 450 ms lock.
    // A user tapping within those 450 ms must still be able to exit to GALLERY.
    const store = useApplicationStore.getState();
    store.dispatch('INIT_DONE');
    store.dispatch('SCAN_OK');
    // Enter slideshow state
    store.dispatch('IDLE_TIMEOUT');
    expect(useApplicationStore.getState().state).toBe('SLIDESHOW');

    // Simulate the entry lock that would be set
    store.beginTransition(450);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);

    // Tap at t=100ms — lock still active, but SLIDESHOW_TAP must NOT be in LOCKABLE_EVENTS
    vi.advanceTimersByTime(100);
    const accepted = store.dispatch('SLIDESHOW_TAP');
    expect(accepted).toBe(true);
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('clears previous lock timer when beginTransition is called again', () => {
    const store = useApplicationStore.getState();
    store.beginTransition(300);
    vi.advanceTimersByTime(200);
    store.beginTransition(400);
    vi.advanceTimersByTime(150);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);
    vi.advanceTimersByTime(250);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(false);
  });

  it('forwards illegal transitions to bridge.logClientMessage rate-limited to 1/sec', () => {
    const store = useApplicationStore.getState();
    store.dispatch('SCAN_OK'); // illegal from INITIALIZING
    store.dispatch('SCAN_OK'); // same reason within 1s -> rate-limited
    expect(bridge.logClientMessage).toHaveBeenCalledTimes(1);
    expect(bridge.logClientMessage).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('Illegal transition: INITIALIZING + SCAN_OK')
    );

    vi.advanceTimersByTime(1001);
    store.dispatch('SCAN_OK');
    expect(bridge.logClientMessage).toHaveBeenCalledTimes(2);
  });
});

describe('executeStartup and handleMediaChangedEvent', () => {
  beforeEach(() => {
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    usePlayerStore.getState().reset();
    useSettingsStore.getState().reset();
    vi.clearAllMocks();
  });

  it('transitions INITIALIZING -> SCANNING_MEDIA -> GALLERY on valid scan', async () => {
    vi.mocked(bridge.getAppConfig).mockResolvedValueOnce(DEFAULT_APP_CONFIG);
    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce({
      items: makeItems(3),
      ignored_orphan_count: 0,
      video_count: 3,
      image_count: 3,
      errors: [],
      root: 'C:/Media',
    });

    await executeStartup();
    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(useMediaStore.getState().items).toHaveLength(3);
  });

  it('transitions to GALLERY when folder is readable with 0 pairs (empty state)', async () => {
    vi.mocked(bridge.getAppConfig).mockResolvedValueOnce(DEFAULT_APP_CONFIG);
    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce({
      items: [],
      ignored_orphan_count: 2,
      video_count: 2,
      image_count: 0,
      errors: [],
      root: 'C:/Media',
    });

    await executeStartup();
    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(useMediaStore.getState().videoCount).toBe(2);
  });

  it('transitions to ERROR when scan returns errors and 0 items', async () => {
    vi.mocked(bridge.getAppConfig).mockResolvedValueOnce(DEFAULT_APP_CONFIG);
    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce({
      items: [],
      ignored_orphan_count: 0,
      video_count: 0,
      image_count: 0,
      errors: ['Failed to read media directory'],
      root: 'C:/Missing',
    });

    await executeStartup();
    expect(useApplicationStore.getState().state).toBe('ERROR');
    expect(useApplicationStore.getState().errorReason).toBe('Failed to read media directory');
  });

  it('transitions to ERROR when bridge.getAppConfig rejects', async () => {
    vi.mocked(bridge.getAppConfig).mockRejectedValueOnce(new Error('IPC failure'));

    await executeStartup();
    expect(useApplicationStore.getState().state).toBe('ERROR');
    expect(useApplicationStore.getState().errorReason).toBe('IPC failure');
  });

  it('handleMediaChangedEvent refreshes in place without resetting page and clamps when shrinking', async () => {
    const scan28: ScanResult = {
      items: makeItems(28),
      ignored_orphan_count: 0,
      video_count: 28,
      image_count: 28,
      errors: [],
      root: 'C:/Media',
    };
    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce(scan28);
    await useMediaStore.getState().refresh(12);

    useMediaStore.getState().setPage(2, 12);
    expect(useMediaStore.getState().currentPage).toBe(2);

    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce({
      ...scan28,
      items: makeItems(26),
    });
    await handleMediaChangedEvent();
    expect(useMediaStore.getState().currentPage).toBe(2);

    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce({
      ...scan28,
      items: makeItems(14),
    });
    await handleMediaChangedEvent();
    expect(useMediaStore.getState().currentPage).toBe(1);
  });
});

describe('usePlayerStore and useSettingsStore', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
    useSettingsStore.getState().reset();
  });

  it('clamps volume and sfxVolume to [0, 1] and resets on selectMedia/clearSelection', () => {
    usePlayerStore.getState().setVolume(1.5);
    expect(usePlayerStore.getState().volume).toBe(1);
    usePlayerStore.getState().setVolume(-0.2);
    expect(usePlayerStore.getState().volume).toBe(0);

    usePlayerStore.getState().selectMedia('clip-1');
    expect(usePlayerStore.getState().selectedMediaId).toBe('clip-1');
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    usePlayerStore.getState().clearSelection();
    expect(usePlayerStore.getState().selectedMediaId).toBeNull();
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    useSettingsStore.getState().setSfxVolume(2.0);
    expect(useSettingsStore.getState().sfxVolume).toBe(1);
    useSettingsStore.getState().setSfxVolume(-1);
    expect(useSettingsStore.getState().sfxVolume).toBe(0);
  });
});
