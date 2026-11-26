import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transition,
  TRANSITION_TABLE,
  type AppEvent,
} from '../renderer/src/services/AppState';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import type { ApplicationState, MediaItem, ScanResult } from '../renderer/src/types';
import { bridge } from '../renderer/src/services/bridge';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    getMediaItems: vi.fn(),
    getAppConfig: vi.fn(),
    setMediaRoot: vi.fn(),
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

describe('useApplicationStore transition lock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useApplicationStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores lockable events while locked and auto-releases after durationMs', () => {
    const store = useApplicationStore.getState();
    expect(store.dispatch('INIT_DONE')).toBe(true);
    expect(store.dispatch('SCAN_OK')).toBe(true);
    expect(useApplicationStore.getState().state).toBe('GALLERY');

    // Select media with 500ms transition lock
    expect(store.dispatch('SELECT_MEDIA', { lockDurationMs: 500 })).toBe(true);
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);

    // Rapid tap / exit while locked must be ignored
    expect(store.dispatch('PLAYER_EXIT')).toBe(false);
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');

    // Advance 499ms -> still locked
    vi.advanceTimersByTime(499);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);

    // Advance 1ms -> unlocked
    vi.advanceTimersByTime(1);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(false);
    expect(store.dispatch('PLAYER_EXIT')).toBe(true);
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('clears previous lock timer when beginTransition is called again', () => {
    const store = useApplicationStore.getState();
    store.beginTransition(300);
    vi.advanceTimersByTime(200);
    // Restart lock for another 400ms
    store.beginTransition(400);
    vi.advanceTimersByTime(150);
    // Original 300ms would have expired at 350ms, but new 400ms must still be locked
    expect(useApplicationStore.getState().isTransitionLocked).toBe(true);
    vi.advanceTimersByTime(250);
    expect(useApplicationStore.getState().isTransitionLocked).toBe(false);
  });
});

describe('useMediaStore page clamping on refresh', () => {
  beforeEach(() => {
    useMediaStore.getState().reset();
    vi.clearAllMocks();
  });

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

  it('keeps currentPage when still valid and clamps when items shrink', async () => {
    const scan20: ScanResult = {
      items: makeItems(20),
      ignored_orphan_count: 0,
      video_count: 20,
      image_count: 20,
      errors: [],
      root: 'C:/Media',
    };
    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce(scan20);
    await useMediaStore.getState().refresh(8);

    // Move to page 2 (3rd page: 0, 1, 2)
    useMediaStore.getState().setPage(2, 8);
    expect(useMediaStore.getState().currentPage).toBe(2);

    // Refresh with 18 items (still 3 pages) -> stays on page 2
    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce({
      ...scan20,
      items: makeItems(18),
    });
    await useMediaStore.getState().refresh(8);
    expect(useMediaStore.getState().currentPage).toBe(2);

    // Refresh with 9 items (only 2 pages: 0, 1) -> clamped to page 1
    vi.mocked(bridge.getMediaItems).mockResolvedValueOnce({
      ...scan20,
      items: makeItems(9),
    });
    await useMediaStore.getState().refresh(8);
    expect(useMediaStore.getState().currentPage).toBe(1);
  });
});
