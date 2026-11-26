import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { VideoPlayer } from '../renderer/src/components/VideoPlayer';
import { TAP_DEBOUNCE_MS } from '../renderer/src/hooks/usePlayerInteraction';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { usePlayerStore } from '../renderer/src/stores/playerStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import type { MediaItem } from '../renderer/src/types';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    logClientMessage: vi.fn().mockResolvedValue(undefined),
    toggleFullscreen: vi.fn().mockResolvedValue(true),
    getAppConfig: vi.fn(),
    getMediaItems: vi.fn(),
    setMediaRoot: vi.fn(),
    pickMediaFolder: vi.fn(),
    onMediaChanged: vi.fn().mockResolvedValue(() => {}),
    onAdminRequested: vi.fn().mockResolvedValue(() => {}),
    exitApp: vi.fn().mockResolvedValue(undefined),
    requestAdmin: vi.fn().mockResolvedValue(undefined),
  },
}));

const SAMPLE_ITEM: MediaItem = {
  id: 'adani',
  filename: 'Adani.mp4',
  display_title: 'Adani',
  video_path: 'C:/Videos/Adani.mp4',
  thumbnail_path: 'C:/Videos/Adani.png',
  video_url: 'http://kiosk-media.localhost/Adani.mp4',
  thumbnail_url: 'http://kiosk-media.localhost/Adani.png',
  file_size: 120_000_000,
};

function tapSurface(el: HTMLElement, x = 500, y = 400, durationMs = 40) {
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1, isPrimary: true });
  vi.advanceTimersByTime(durationMs);
  fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1, isPrimary: true });
}

describe('Player Tap Contract (Brief §7) & Auto-Hide', () => {
  let pausedState = false;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    pausedState = false;

    useApplicationStore.getState().reset();
    usePlayerStore.getState().reset();
    useSettingsStore.getState().reset();

    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK');
    useApplicationStore.getState().dispatch('SELECT_MEDIA');
    usePlayerStore.getState().selectMedia(SAMPLE_ITEM.id);

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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('Rule (a) & (b): hidden+tap shows controls & pauses; visible+tap resumes & hides controls', () => {
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const surface = screen.getByTestId('video-player-screen');

    expect(usePlayerStore.getState().controlsVisible).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    // (a) Controls hidden + tap blank surface -> show controls AND pause
    act(() => {
      tapSurface(surface);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    // Advance past debounce
    vi.advanceTimersByTime(TAP_DEBOUNCE_MS + 10);

    // (b) Controls visible + tap blank surface -> resume AND hide controls
    act(() => {
      tapSurface(surface);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('Rule (c): tapping Play/Pause control does NOT toggle visibility or bubble to surface', () => {
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const surface = screen.getByTestId('video-player-screen');

    // Reveal controls (and pause) via surface tap
    act(() => {
      tapSurface(surface);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    vi.advanceTimersByTime(TAP_DEBOUNCE_MS + 10);

    // Click Play button inside controls -> resumes playback, keeps controls visible!
    const playBtn = screen.getByRole('button', { name: 'Play' });
    fireEvent.pointerDown(playBtn, { pointerId: 1 });
    fireEvent.pointerUp(playBtn, { pointerId: 1 });
    fireEvent.click(playBtn);

    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(usePlayerStore.getState().controlsVisible).toBe(true);
  });

  it('Rule (d): ignores drags (>10px) and long presses (>400ms)', () => {
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const surface = screen.getByTestId('video-player-screen');

    // Drag > 10px
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 130, clientY: 100, pointerId: 1 });
    expect(usePlayerStore.getState().controlsVisible).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    // Long press > 400ms
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerId: 1 });
    vi.advanceTimersByTime(500);
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(usePlayerStore.getState().controlsVisible).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('Rule (e): auto-hides after controls_auto_hide_seconds ONLY while playing; paused keeps visible', () => {
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const surface = screen.getByTestId('video-player-screen');
    const video = screen.getByTestId('kiosk-video-element');
    fireEvent(video, new Event('canplay'));

    // Tap to show controls & pause
    act(() => {
      tapSurface(surface);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    // Wait 10 seconds while paused -> controls MUST stay visible
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(true);

    // Resume via control button -> auto-hide timer (4s) starts
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(usePlayerStore.getState().controlsVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(false);
  });

  it('Rule (f): debounces rapid taps within 250ms', () => {
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const surface = screen.getByTestId('video-player-screen');

    act(() => {
      tapSurface(surface);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    // Second tap 100ms later -> debounced!
    vi.advanceTimersByTime(100);
    act(() => {
      tapSurface(surface);
    });
    expect(usePlayerStore.getState().controlsVisible).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('A7: ignores non-primary pointer events (palm rejection and multi-touch)', () => {
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const surface = screen.getByTestId('video-player-screen');

    // Controls start hidden and playing
    expect(usePlayerStore.getState().controlsVisible).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    // Non-primary pointer event (palm touch or second finger)
    act(() => {
      fireEvent.pointerDown(surface, { clientX: 400, clientY: 300, pointerId: 2, isPrimary: false });
      vi.advanceTimersByTime(50);
      fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerId: 2, isPrimary: false });
    });

    // Playback state and controls visibility must remain unchanged
    expect(usePlayerStore.getState().controlsVisible).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });
});
