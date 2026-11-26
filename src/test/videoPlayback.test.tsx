import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { VideoPlayer } from '../renderer/src/components/VideoPlayer';
import { LOAD_WATCHDOG_MS, STALL_WATCHDOG_MS } from '../renderer/src/hooks/useVideoPlayback';
import { IdleTimerService } from '../renderer/src/services/IdleTimerService';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { usePlayerStore } from '../renderer/src/stores/playerStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import { bridge } from '../renderer/src/services/bridge';
import type { MediaItem } from '../renderer/src/types';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    logClientMessage: vi.fn().mockResolvedValue(undefined),
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

describe('VideoPlayer & useVideoPlayback lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bridge.logClientMessage).mockResolvedValue(undefined);
    useApplicationStore.getState().reset();
    usePlayerStore.getState().reset();

    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK');
    useApplicationStore.getState().dispatch('SELECT_MEDIA');
    usePlayerStore.getState().selectMedia(SAMPLE_ITEM.id);

    // Default jsdom HTMLMediaElement stubs
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sets video.src to http://kiosk-media.localhost URL, unmuted autoplay, and releases cleanly on unmount', () => {
    const { unmount } = render(<VideoPlayer item={SAMPLE_ITEM} />);
    const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;

    expect(video.getAttribute('src')).toBe(SAMPLE_ITEM.video_url);
    expect(video.muted).toBe(false);

    unmount();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(video.hasAttribute('src')).toBe(false);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
  });

  it('handles blocked autoplay (NotAllowedError) by showing paused state + controls visible without muting', async () => {
    const err = Object.assign(new Error('Autoplay blocked'), { name: 'NotAllowedError' });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(err);

    await act(async () => {
      render(<VideoPlayer item={SAMPLE_ITEM} />);
      await Promise.resolve();
    });

    const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;
    expect(video.muted).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().controlsVisible).toBe(true);
    expect(bridge.logClientMessage).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('Autoplay blocked')
    );
  });

  it('treats NaN/Infinity duration as 0 (unknown duration) and throttles timeupdate to ~4/s', () => {
    vi.useFakeTimers();
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;

    Object.defineProperty(video, 'duration', { value: NaN, configurable: true });
    fireEvent(video, new Event('loadedmetadata'));
    expect(usePlayerStore.getState().duration).toBe(0);

    Object.defineProperty(video, 'duration', { value: 120, configurable: true });
    fireEvent(video, new Event('loadedmetadata'));
    expect(usePlayerStore.getState().duration).toBe(120);

    // Rapid timeupdate within 250ms should be throttled
    vi.setSystemTime(1000);
    Object.defineProperty(video, 'currentTime', { value: 10, configurable: true });
    fireEvent(video, new Event('timeupdate'));
    expect(usePlayerStore.getState().currentTime).toBe(10);

    vi.setSystemTime(1100);
    Object.defineProperty(video, 'currentTime', { value: 11, configurable: true });
    fireEvent(video, new Event('timeupdate'));
    expect(usePlayerStore.getState().currentTime).toBe(10); // throttled

    vi.setSystemTime(1300);
    fireEvent(video, new Event('timeupdate'));
    expect(usePlayerStore.getState().currentTime).toBe(11); // updated after 250ms
  });

  it('shows Error Overlay on media error, logs error code, and Back to gallery exits to GALLERY', () => {
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;

    Object.defineProperty(video, 'error', {
      value: { code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' },
      configurable: true,
    });
    fireEvent(video, new Event('error'));

    expect(screen.getByTestId('player-error-overlay')).toBeInTheDocument();
    expect(bridge.logClientMessage).toHaveBeenCalledWith(
      'ERROR',
      expect.stringContaining('adani')
    );

    fireEvent.click(screen.getByRole('button', { name: /Back to gallery/i }));
    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(usePlayerStore.getState().selectedMediaId).toBeNull();
  });

  it('triggers Error Overlay if load watchdog expires after 10s without loadedmetadata/canplay', () => {
    vi.useFakeTimers();
    render(<VideoPlayer item={SAMPLE_ITEM} />);

    act(() => {
      vi.advanceTimersByTime(LOAD_WATCHDOG_MS);
    });

    expect(screen.getByTestId('player-error-overlay')).toBeInTheDocument();
    expect(bridge.logClientMessage).toHaveBeenCalledWith(
      'ERROR',
      expect.stringContaining('Load watchdog timeout')
    );
  });

  it('returns to GALLERY and resets IdleTimerService on ended when return_to_gallery_on_end is true', () => {
    const resetSpy = vi.spyOn(IdleTimerService, 'reset');
    useSettingsStore.getState().reset();
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const video = screen.getByTestId('kiosk-video-element');

    fireEvent(video, new Event('ended'));
    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(usePlayerStore.getState().selectedMediaId).toBeNull();
    expect(resetSpy).toHaveBeenCalledTimes(1);
    resetSpy.mockRestore();
  });

  it('stays on last frame with controls visible on ended when return_to_gallery_on_end is false', () => {
    useSettingsStore.setState((s) => ({
      config: { ...s.config, return_to_gallery_on_end: false },
    }));
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const video = screen.getByTestId('kiosk-video-element');

    fireEvent(video, new Event('ended'));
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().controlsVisible).toBe(true);
  });

  it('does not clearSelection if Back is tapped during transition lock, but Error Overlay Back always exits', () => {
    useApplicationStore.getState().beginTransition(500);
    usePlayerStore.getState().setControlsVisible(true);
    render(<VideoPlayer item={SAMPLE_ITEM} />);

    // Normal Back during lock -> ignored, selection preserved
    fireEvent.click(screen.getByRole('button', { name: 'Back to gallery' }));
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
    expect(usePlayerStore.getState().selectedMediaId).toBe(SAMPLE_ITEM.id);

    // Trigger error overlay while STILL locked -> Error Overlay Back releases lock & exits
    const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;
    Object.defineProperty(video, 'error', { value: { code: 4, message: 'err' }, configurable: true });
    fireEvent(video, new Event('error'));
    fireEvent.click(screen.getByRole('button', { name: /Back to gallery/i }));

    expect(useApplicationStore.getState().state).toBe('GALLERY');
    expect(usePlayerStore.getState().selectedMediaId).toBeNull();
  });

  it('triggers Error Overlay if currentTime stalls for 15s while playing', () => {
    vi.useFakeTimers();
    render(<VideoPlayer item={SAMPLE_ITEM} />);
    const video = screen.getByTestId('kiosk-video-element') as HTMLVideoElement;

    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 5.5, configurable: true });
    fireEvent(video, new Event('canplay'));

    act(() => {
      vi.advanceTimersByTime(STALL_WATCHDOG_MS);
    });

    expect(screen.getByTestId('player-error-overlay')).toBeInTheDocument();
    expect(bridge.logClientMessage).toHaveBeenCalledWith(
      'ERROR',
      expect.stringContaining('Playback stall watchdog (15s)')
    );
  });
});
