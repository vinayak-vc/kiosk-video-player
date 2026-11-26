import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AudioService } from '../services/AudioService';
import { bridge } from '../services/bridge';
import {
  SlideshowController,
  SCREENSAVER_TRACK_ID,
  type SlideshowMode,
  type SlideshowTrack,
} from '../services/SlideshowController';
import { useAnimationPresets } from '../hooks/useAnimationPresets';
import { useApplicationStore } from '../stores/applicationStore';
import { useMediaStore } from '../stores/mediaStore';
import { useSettingsStore } from '../stores/settingsStore';
import styles from './SlideshowScreen.module.css';

const CROSSFADE_DURATION_MS = 600;
const STALL_TIMEOUT_MS = 15_000;
const STALL_CHECK_INTERVAL_MS = 3_000;

function releaseVideoElement(video: HTMLVideoElement | null): void {
  if (!video) return;
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    // Ignore cleanup errors on detached/jsdom video elements
  }
}

export const SlideshowScreen: React.FC = () => {
  const items = useMediaStore((s) => s.items);
  const screensaver = useMediaStore((s) => s.screensaver);
  const slideshowMode = useSettingsStore((s) => s.config.slideshow_mode);
  const screensaverSound = useSettingsStore((s) => s.config.screensaver_sound);
  const dispatch = useApplicationStore((s) => s.dispatch);
  const presets = useAnimationPresets();

  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const controllerRef = useRef<SlideshowController | null>(null);
  const crossfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef<number>(-1);
  const lastProgressAtRef = useRef<number>(Date.now());
  const exitingRef = useRef(false);

  const [activeSlot, setActiveSlot] = useState<'a' | 'b'>('a');
  const [slotATrack, setSlotATrack] = useState<SlideshowTrack | null>(null);
  const [slotBTrack, setSlotBTrack] = useState<SlideshowTrack | null>(null);
  const [effectiveMode, setEffectiveMode] = useState<SlideshowMode>('screensaver');

  const clearTimers = useCallback(() => {
    if (crossfadeTimerRef.current !== null) {
      clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    if (stallTimerRef.current !== null) {
      clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const releaseAllVideos = useCallback(() => {
    releaseVideoElement(videoARef.current);
    releaseVideoElement(videoBRef.current);
  }, []);

  const handleFatalNoMedia = useCallback(
    (reason: string) => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      clearTimers();
      releaseAllVideos();
      void bridge.logClientMessage('ERROR', `Slideshow failed: ${reason}`).catch(() => {});
      dispatch('FATAL_ERROR', { errorReason: reason });
    },
    [clearTimers, releaseAllVideos, dispatch]
  );

  const advanceToNextTrack = useCallback(
    (fromSlot: 'a' | 'b') => {
      if (exitingRef.current) return;
      const controller = controllerRef.current;
      if (!controller) return;

      const nextTrack = controller.next();
      const nextMode = controller.getEffectiveMode();
      setEffectiveMode(nextMode);
      if (!nextTrack) return;

      if (nextTrack.isScreensaver) {
        setActiveSlot('a');
        setSlotATrack(nextTrack);
        setSlotBTrack(null);
        return;
      }

      const nextSlot = fromSlot === 'a' ? 'b' : 'a';
      const oldVideo = fromSlot === 'a' ? videoARef.current : videoBRef.current;

      if (nextSlot === 'a') {
        setSlotATrack(nextTrack);
      } else {
        setSlotBTrack(nextTrack);
      }
      setActiveSlot(nextSlot);

      if (crossfadeTimerRef.current !== null) {
        clearTimeout(crossfadeTimerRef.current);
      }
      crossfadeTimerRef.current = setTimeout(() => {
        crossfadeTimerRef.current = null;
        releaseVideoElement(oldVideo);
        if (fromSlot === 'a') {
          setSlotATrack(null);
        } else {
          setSlotBTrack(null);
        }

        // Preload the track AFTER the following one so the inactive slot is
        // ready before it becomes active. We peek via controller.peek() if
        // available, otherwise we let the next advanceToNextTrack() handle it.
        // This keeps the inactive <video> warm so crossfade starts from a
        // decoded frame rather than a frozen/unloaded video.
        if (!exitingRef.current && controllerRef.current) {
          const upcoming = controllerRef.current.peek?.();
          if (upcoming && !upcoming.isScreensaver) {
            const inactiveVideo =
              nextSlot === 'a' ? videoBRef.current : videoARef.current;
            if (inactiveVideo && !inactiveVideo.src.includes(upcoming.url)) {
              inactiveVideo.src = upcoming.url;
              inactiveVideo.muted = true;
              inactiveVideo.load();
            }
          }
        }
      }, CROSSFADE_DURATION_MS);
    },
    []
  );

  const handleVideoError = useCallback(
    (slot: 'a' | 'b') => {
      if (exitingRef.current) return;
      const track = slot === 'a' ? slotATrack : slotBTrack;
      const controller = controllerRef.current;
      if (!track || !controller) return;

      void bridge
        .logClientMessage('WARN', `Slideshow playback error on '${track.title}'`)
        .catch(() => {});
      controller.markFailed(track.id);
      setEffectiveMode(controller.getEffectiveMode());
      advanceToNextTrack(slot);
    },
    [slotATrack, slotBTrack, advanceToNextTrack]
  );

  const handleVideoEnded = useCallback(
    (slot: 'a' | 'b') => {
      if (exitingRef.current) return;
      const track = slot === 'a' ? slotATrack : slotBTrack;
      const video = slot === 'a' ? videoARef.current : videoBRef.current;
      if (!track) return;

      // In screensaver mode, loop attribute handles seamless repeat; fallback restarts if 'ended' still fires
      if (track.isScreensaver && video) {
        video.currentTime = 0;
        void Promise.resolve(video.play()).catch(() => {
          if (exitingRef.current) return;
          handleVideoError(slot);
        });
        return;
      }

      if (slot === activeSlot) {
        advanceToNextTrack(slot);
      }
    },
    [activeSlot, slotATrack, slotBTrack, advanceToNextTrack, handleVideoError]
  );

  // Initialize controller on mount
  useEffect(() => {
    exitingRef.current = false;
    AudioService.play('slideshowTransition');

    const controller = new SlideshowController({
      mode: slideshowMode,
      items,
      screensaver,
      screensaverSound,
      onWarn: (msg) => {
        void bridge.logClientMessage('WARN', msg).catch(() => {});
      },
      onAllFailed: handleFatalNoMedia,
    });
    controllerRef.current = controller;

    const first = controller.next();
    setEffectiveMode(controller.getEffectiveMode());
    if (first) {
      setActiveSlot('a');
      setSlotATrack(first);
      setSlotBTrack(null);
    }

    return () => {
      clearTimers();
      releaseAllVideos();
      controllerRef.current = null;
    };
    // Run once on mount; live media/config updates are pushed via updateConfigAndMedia below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Propagate live media or config updates while in slideshow
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.updateConfigAndMedia({
      mode: slideshowMode,
      items,
      screensaver,
      screensaverSound,
    });
    setEffectiveMode(controller.getEffectiveMode());

    // If active track was screensaver and screensaver was removed on disk mid-slideshow
    if (activeSlot === 'a' && slotATrack?.isScreensaver && !screensaver) {
      void bridge
        .logClientMessage('WARN', 'Screensaver removed from disk mid-slideshow; transitioning to shuffle')
        .catch(() => {});
      controller.markFailed(SCREENSAVER_TRACK_ID);
      setEffectiveMode(controller.getEffectiveMode());
      advanceToNextTrack('a');
    }
  }, [slideshowMode, items, screensaver, screensaverSound, activeSlot, slotATrack, advanceToNextTrack]);

  // Stall watchdog for active video
  useEffect(() => {
    if (stallTimerRef.current !== null) {
      clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    lastTimeRef.current = -1;
    lastProgressAtRef.current = Date.now();

    stallTimerRef.current = setInterval(() => {
      if (exitingRef.current) return;
      const activeVideo = activeSlot === 'a' ? videoARef.current : videoBRef.current;
      const activeTrack = activeSlot === 'a' ? slotATrack : slotBTrack;
      if (!activeVideo || !activeTrack) return;

      const cur = activeVideo.currentTime;
      if (cur !== lastTimeRef.current) {
        lastTimeRef.current = cur;
        lastProgressAtRef.current = Date.now();
        return;
      }

      if (Date.now() - lastProgressAtRef.current >= STALL_TIMEOUT_MS) {
        void bridge
          .logClientMessage('WARN', `Slideshow video stalled: ${activeTrack.title}`)
          .catch(() => {});
        const controller = controllerRef.current;
        if (!controller) return;
        controller.markFailed(activeTrack.id);
        const replacement = controller.next();
        setEffectiveMode(controller.getEffectiveMode());
        if (replacement) {
          if (activeSlot === 'a') {
            setSlotATrack(replacement);
          } else {
            setSlotBTrack(replacement);
          }
          lastProgressAtRef.current = Date.now();
        }
      }
    }, STALL_CHECK_INTERVAL_MS);

    return () => {
      if (stallTimerRef.current !== null) {
        clearInterval(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };
  }, [activeSlot, slotATrack, slotBTrack]);

  // Autoplay newly assigned active slot with muted retry on browser/webview rejection
  useEffect(() => {
    const activeVideo = activeSlot === 'a' ? videoARef.current : videoBRef.current;
    const activeTrack = activeSlot === 'a' ? slotATrack : slotBTrack;
    if (!activeVideo || !activeTrack) return;

    activeVideo.muted = activeTrack.muted;
    void Promise.resolve(activeVideo.play()).catch(() => {
      if (exitingRef.current) return;
      // If unmuted autoplay fails, retry muted per [C-29] carry-forward
      if (!activeVideo.muted) {
        void bridge
          .logClientMessage('WARN', `Autoplay rejected for '${activeTrack.title}', retrying muted`)
          .catch(() => {});
        activeVideo.muted = true;
        void Promise.resolve(activeVideo.play()).catch(() => {
          handleVideoError(activeSlot);
        });
      } else {
        handleVideoError(activeSlot);
      }
    });
  }, [activeSlot, slotATrack, slotBTrack, handleVideoError]);

  const handleTapExit = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.isPrimary === false) return;
      if (exitingRef.current) return;

      // Dispatch FIRST — SLIDESHOW_TAP is never lockable, so this always
      // succeeds from SLIDESHOW state. If (hypothetically) the transition is
      // rejected we must NOT set exitingRef or release videos, otherwise the
      // screen is permanently stranded on a black frame.
      void AudioService.resumeOnGesture();
      AudioService.play('return');
      const accepted = dispatch('SLIDESHOW_TAP');
      if (!accepted) return;

      exitingRef.current = true;
      clearTimers();
      releaseAllVideos();
    },
    [clearTimers, releaseAllVideos, dispatch]
  );

  const isSingleScreensaver = effectiveMode === 'screensaver' && Boolean(slotATrack?.isScreensaver);

  return (
    <motion.div
      className={styles.slideshowContainer}
      data-testid="slideshow-screen"
      data-slideshow-mode={effectiveMode}
      variants={presets.playerEntrance}
      initial="hidden"
      animate="visible"
      exit="exit"
      onPointerDown={handleTapExit}
    >
      <video
        ref={videoARef}
        data-testid="slideshow-video-a"
        className={`${styles.videoLayer} ${activeSlot === 'a' ? styles.active : styles.inactive}`}
        src={slotATrack?.url}
        autoPlay
        playsInline
        loop={Boolean(slotATrack?.loop)}
        muted={activeSlot !== 'a' || Boolean(slotATrack?.muted)}
        onEnded={() => handleVideoEnded('a')}
        onError={() => handleVideoError('a')}
      />

      {!isSingleScreensaver && (
        <video
          ref={videoBRef}
          data-testid="slideshow-video-b"
          className={`${styles.videoLayer} ${activeSlot === 'b' ? styles.active : styles.inactive}`}
          src={slotBTrack?.url}
          autoPlay
          playsInline
          muted={activeSlot !== 'b' || Boolean(slotBTrack?.muted)}
          onEnded={() => handleVideoEnded('b')}
          onError={() => handleVideoError('b')}
        />
      )}
    </motion.div>
  );
};
