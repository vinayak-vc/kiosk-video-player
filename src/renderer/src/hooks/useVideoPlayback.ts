import { useEffect, useRef, useState } from 'react';
import { bridge } from '../services/bridge';
import { usePlayerStore } from '../stores/playerStore';
import { STRINGS } from '../strings';

export const LOAD_WATCHDOG_MS = 10_000;
export const STALL_WATCHDOG_MS = 15_000;
export const STALL_CHECK_INTERVAL_MS = 3_000;
export const TIMEUPDATE_THROTTLE_MS = 250; // ~4 updates/sec

// Module-level guard ensuring at most one active <video> plays app-wide.
let activeVideoElement: HTMLVideoElement | null = null;

export function releaseVideoElement(video: HTMLVideoElement | null): void {
  if (!video) return;
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    // Ignore jsdom or detached element errors
  }
  if (activeVideoElement === video) {
    activeVideoElement = null;
  }
}

export interface UseVideoPlaybackOptions {
  mediaId: string;
  videoUrl: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  onCanPlay?: () => void;
}

export interface UseVideoPlaybackResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  isBuffering: boolean;
  isDurationKnown: boolean;
  playbackError: string | null;
}

export function useVideoPlayback({
  mediaId,
  videoUrl,
  autoPlay = true,
  onEnded,
  onCanPlay,
}: UseVideoPlaybackOptions): UseVideoPlaybackResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isDurationKnown, setIsDurationKnown] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onCanPlayRef = useRef(onCanPlay);
  onCanPlayRef.current = onCanPlay;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    // Pause any previously active <video> app-wide
    if (activeVideoElement && activeVideoElement !== video) {
      try {
        activeVideoElement.pause();
      } catch {
        // ignore
      }
    }
    activeVideoElement = video;

    setIsReady(false);
    setIsBuffering(true);
    setIsDurationKnown(false);
    setPlaybackError(null);

    let disposed = false;
    let lastTimeUpdateMs = 0;
    let readyFlag = false;
    let lastObservedTime = -1;
    let lastProgressAtMs = Date.now();

    // Load watchdog: never leave visitor on an infinite black/spinner screen
    let watchdogId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (disposed) return;
      const msg = STRINGS.player.loadWatchdogError;
      setIsBuffering(false);
      setPlaybackError(msg);
      void Promise.resolve(
        bridge.logClientMessage('ERROR', `Load watchdog timeout for media '${mediaId}' (${videoUrl})`)
      ).catch(() => {});
    }, LOAD_WATCHDOG_MS);

    // Mid-playback stall watchdog: if currentTime does not advance for 15s while playing -> error overlay
    const stallIntervalId = setInterval(() => {
      if (disposed || !readyFlag) return;
      if (video.paused || video.ended) {
        lastProgressAtMs = Date.now();
        lastObservedTime = video.currentTime;
        return;
      }
      const cur = video.currentTime;
      if (cur !== lastObservedTime) {
        lastObservedTime = cur;
        lastProgressAtMs = Date.now();
        return;
      }
      if (Date.now() - lastProgressAtMs >= STALL_WATCHDOG_MS) {
        clearInterval(stallIntervalId);
        const msg = STRINGS.player.stallError;
        setIsBuffering(false);
        setPlaybackError(msg);
        usePlayerStore.getState().setPlaying(false);
        void Promise.resolve(
          bridge.logClientMessage(
            'ERROR',
            `Playback stall watchdog (15s) for media '${mediaId}' at currentTime=${cur.toFixed(2)}`
          )
        ).catch(() => {});
      }
    }, STALL_CHECK_INTERVAL_MS);

    const clearWatchdog = () => {
      if (watchdogId !== null) {
        clearTimeout(watchdogId);
        watchdogId = null;
      }
    };

    const handleLoadedMetadata = () => {
      if (disposed) return;
      clearWatchdog();
      const dur = video.duration;
      if (Number.isFinite(dur) && dur > 0) {
        setIsDurationKnown(true);
        usePlayerStore.getState().setProgress(video.currentTime || 0, dur);
      } else {
        setIsDurationKnown(false);
        usePlayerStore.getState().setProgress(0, 0);
      }
    };

    const handleCanPlay = () => {
      if (disposed) return;
      clearWatchdog();
      readyFlag = true;
      lastObservedTime = video.currentTime;
      lastProgressAtMs = Date.now();
      setIsReady(true);
      setIsBuffering(false);
      onCanPlayRef.current?.();
    };

    const handlePlay = () => {
      if (disposed) return;
      usePlayerStore.getState().setPlaying(true);
    };

    const handlePause = () => {
      if (disposed) return;
      usePlayerStore.getState().setPlaying(false);
    };

    const handleTimeUpdate = () => {
      if (disposed) return;
      const now = Date.now();
      if (now - lastTimeUpdateMs < TIMEUPDATE_THROTTLE_MS) return;
      lastTimeUpdateMs = now;
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const cur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      usePlayerStore.getState().setProgress(cur, dur);
    };

    const handleWaiting = () => {
      if (!disposed) setIsBuffering(true);
    };

    const handlePlaying = () => {
      if (!disposed) setIsBuffering(false);
    };

    const handleEnded = () => {
      if (disposed) return;
      usePlayerStore.getState().setPlaying(false);
      onEndedRef.current?.();
    };

    const handleError = () => {
      if (disposed) return;
      clearWatchdog();
      setIsBuffering(false);
      const code = video.error?.code ?? 0;
      const detail = video.error?.message || `MediaError code ${code}`;
      const msg = STRINGS.player.unableToPlay(code);
      setPlaybackError(msg);
      usePlayerStore.getState().setPlaying(false);
      void Promise.resolve(
        bridge.logClientMessage('ERROR', `Playback error for media '${mediaId}': ${detail} (code ${code})`)
      ).catch(() => {});
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    // Apply initial volume & mute state from playerStore
    const { volume, isMuted } = usePlayerStore.getState();
    video.volume = volume;
    video.muted = isMuted;
    video.src = videoUrl;

    if (autoPlay) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err: unknown) => {
          if (disposed) return;
          // Autoplay with sound was blocked -> show paused indicator & controls (never mute silently)
          usePlayerStore.getState().setPlaying(false);
          usePlayerStore.getState().setControlsVisible(true);
          const reason = err instanceof Error ? err.message : String(err);
          void Promise.resolve(
            bridge.logClientMessage('WARN', `Autoplay blocked for '${mediaId}': ${reason}`)
          ).catch(() => {});
        });
      }
    }

    return () => {
      disposed = true;
      clearWatchdog();
      clearInterval(stallIntervalId);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      releaseVideoElement(video);
    };
  }, [mediaId, videoUrl, autoPlay]);

  return {
    videoRef,
    isReady,
    isBuffering,
    isDurationKnown,
    playbackError,
  };
}
