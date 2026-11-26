import { useCallback, useEffect, useRef } from 'react';
import { AudioService } from '../services/AudioService';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';

export const TAP_MAX_DISTANCE_PX = 10;
export const TAP_MAX_DURATION_MS = 400;
export const TAP_DEBOUNCE_MS = 250;

export interface UsePlayerInteractionOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  controlsVisible: boolean;
  disabled?: boolean;
}

export interface UsePlayerInteractionResult {
  surfaceHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
  };
  resetAutoHideTimer: () => void;
}

/**
 * Implements Brief §7 Tap Contract & Auto-Hide using Pointer Events only:
 * - Controls hidden + tap blank surface -> show controls AND toggle playback
 * - Controls visible + tap blank surface -> toggle playback AND hide controls
 * - Auto-hide after `controls_auto_hide_seconds` ONLY while playing (paused keeps visible)
 * - 250ms tap debounce prevents desync from rapid tapping
 * - Rejects drags (>10px) and long presses (>400ms)
 */
export function usePlayerInteraction({
  videoRef,
  isPlaying,
  controlsVisible,
  disabled = false,
}: UsePlayerInteractionOptions): UsePlayerInteractionResult {
  const autoHideSeconds = useSettingsStore((s) => s.config.controls_auto_hide_seconds);

  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    timeMs: number;
  } | null>(null);
  const lastTapMsRef = useRef<number>(0);

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current !== null) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const resetAutoHideTimer = useCallback(() => {
    clearAutoHideTimer();
    const { controlsVisible: visible, isPlaying: playing } = usePlayerStore.getState();
    if (!visible || !playing || disabled) {
      return;
    }
    const delayMs = Math.max(1, autoHideSeconds) * 1000;
    autoHideTimerRef.current = setTimeout(() => {
      autoHideTimerRef.current = null;
      if (usePlayerStore.getState().isPlaying) {
        usePlayerStore.getState().setControlsVisible(false);
      }
    }, delayMs);
  }, [clearAutoHideTimer, autoHideSeconds, disabled]);

  // Synchronize auto-hide timer with playing/visible changes and clear on unmount
  useEffect(() => {
    if (controlsVisible && isPlaying && !disabled) {
      resetAutoHideTimer();
    } else {
      clearAutoHideTimer();
    }
    return () => {
      clearAutoHideTimer();
    };
  }, [controlsVisible, isPlaying, disabled, resetAutoHideTimer, clearAutoHideTimer]);

  const togglePlaybackFromElement = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void Promise.resolve(video.play()).catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      if (e.isPrimary === false) return;
      void AudioService.resumeOnGesture();
      pointerDownRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        timeMs: Date.now(),
      };
    },
    [disabled]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (disabled || !start || start.pointerId !== e.pointerId || e.isPrimary === false) return;

      const now = Date.now();
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const distance = Math.hypot(dx, dy);
      const duration = now - start.timeMs;

      // Reject drags and long-presses
      if (distance > TAP_MAX_DISTANCE_PX || duration > TAP_MAX_DURATION_MS) {
        return;
      }

      // 250ms tap debounce
      if (now - lastTapMsRef.current < TAP_DEBOUNCE_MS) {
        return;
      }
      lastTapMsRef.current = now;

      AudioService.play('tap');

      const currentVisible = usePlayerStore.getState().controlsVisible;
      // Spec §7:
      // - Controls hidden + tap blank surface -> show controls AND toggle play/pause
      // - Controls visible + tap blank surface -> toggle play/pause AND hide controls
      usePlayerStore.getState().setControlsVisible(!currentVisible);
      togglePlaybackFromElement();
    },
    [disabled, togglePlaybackFromElement]
  );

  const onPointerCancel = useCallback(() => {
    pointerDownRef.current = null;
  }, []);

  return {
    surfaceHandlers: {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
    },
    resetAutoHideTimer,
  };
}
