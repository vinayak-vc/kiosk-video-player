import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useAnimationPresets } from '../hooks/useAnimationPresets';
import { AudioService } from '../services/AudioService';
import { bridge } from '../services/bridge';
import styles from './PlayerControls.module.css';

export function formatTime(seconds: number, isKnown = true): string {
  if (!isKnown || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const mm = hrs > 0 ? String(mins).padStart(2, '0') : String(mins);
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface PlayerControlsProps {
  title: string;
  visible: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isDurationKnown: boolean;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  onTogglePlay: () => void;
  onSeek: (timeSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onBack: () => void;
  onUserInteraction?: () => void;
}

const SCRUB_SEEK_THROTTLE_MS = 100;

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  title,
  visible,
  isPlaying,
  currentTime,
  duration,
  isDurationKnown,
  volume,
  isMuted,
  isFullscreen,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onBack,
  onUserInteraction,
}) => {
  const presets = useAnimationPresets();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastSeekMsRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const stopSurfacePropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const computeTimeFromPointer = (clientX: number): number => {
    const track = trackRef.current;
    if (!track || !isDurationKnown || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!isDurationKnown || duration <= 0) return;

    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onUserInteraction?.();

    const next = computeTimeFromPointer(e.clientX);
    setScrubTime(next);
    lastSeekMsRef.current = Date.now();
    onSeek(next);
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!isDraggingRef.current || !isDurationKnown || duration <= 0) return;

    const next = computeTimeFromPointer(e.clientX);
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      setScrubTime(next);
      rafIdRef.current = null;
    });

    const now = Date.now();
    if (now - lastSeekMsRef.current >= SCRUB_SEEK_THROTTLE_MS) {
      lastSeekMsRef.current = now;
      onSeek(next);
    }
    onUserInteraction?.();
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const finalTime = computeTimeFromPointer(e.clientX);
    setScrubTime(null);
    onSeek(finalTime);
    onUserInteraction?.();
  };

  const displayedTime = scrubTime ?? currentTime;
  const progressPct =
    isDurationKnown && duration > 0
      ? Math.max(0, Math.min(100, (displayedTime / duration) * 100))
      : 0;

  return (
    <AnimatePresence>
      {(visible || !isPlaying) && (
        <div
          className={styles.overlayRoot}
          data-testid="player-controls-overlay"
        >
          {/* Center play/pause indicator when paused */}
          {!isPlaying && (
            <motion.button
              type="button"
              className={styles.centerIndicator}
              aria-label="Resume playback"
              data-testid="center-play-indicator"
              variants={presets.controlReveal}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onPointerDown={stopSurfacePropagation}
              onPointerUp={stopSurfacePropagation}
              onClick={(e) => {
                e.stopPropagation();
                AudioService.play('tap');
                onUserInteraction?.();
                onTogglePlay();
              }}
            >
              <Play size={44} fill="currentColor" />
            </motion.button>
          )}

          {visible && (
            <>
              <motion.div
                className={styles.topBar}
                variants={presets.controlReveal}
                initial="hidden"
                animate="visible"
                exit="hidden"
                onPointerDown={stopSurfacePropagation}
                onPointerUp={stopSurfacePropagation}
              >
                <button
                  type="button"
                  className={styles.backButton}
                  aria-label="Back to gallery"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBack();
                  }}
                >
                  <ArrowLeft size={22} />
                  Back
                </button>
                <div className={styles.titleBadge}>{title}</div>
              </motion.div>

              <motion.div
                className={styles.bottomBar}
                variants={presets.controlReveal}
                initial="hidden"
                animate="visible"
                exit="hidden"
                onPointerDown={stopSurfacePropagation}
                onPointerUp={stopSurfacePropagation}
              >
                <div
                  ref={trackRef}
                  role="slider"
                  aria-label="Seek timeline"
                  aria-valuemin={0}
                  aria-valuemax={isDurationKnown ? Math.floor(duration) : 0}
                  aria-valuenow={isDurationKnown ? Math.floor(displayedTime) : 0}
                  aria-disabled={!isDurationKnown}
                  className={`${styles.timelineTrack} ${!isDurationKnown ? styles.timelineTrackDisabled : ''}`}
                  data-testid="player-timeline"
                  onPointerDown={handleTimelinePointerDown}
                  onPointerMove={handleTimelinePointerMove}
                  onPointerUp={handleTimelinePointerUp}
                  onPointerCancel={handleTimelinePointerUp}
                >
                  <div className={styles.timelineRail}>
                    <div
                      className={styles.timelineFill}
                      style={{ width: `${progressPct}%` }}
                    />
                    {isDurationKnown && (
                      <div
                        className={styles.timelineThumb}
                        style={{ left: `${progressPct}%` }}
                      />
                    )}
                  </div>
                </div>

                <div className={styles.controlsRow}>
                  <div className={styles.leftGroup}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      onClick={(e) => {
                        e.stopPropagation();
                        AudioService.play('tap');
                        onUserInteraction?.();
                        onTogglePlay();
                      }}
                    >
                      {isPlaying ? <Pause size={30} /> : <Play size={30} fill="currentColor" />}
                    </button>

                    <span className={styles.timeLabel} data-testid="player-time-label">
                      {formatTime(displayedTime, isDurationKnown)} / {formatTime(duration, isDurationKnown)}
                    </span>
                  </div>

                  <div className={styles.rightGroup}>
                    <div className={styles.volumeGroup}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={isMuted ? 'Unmute' : 'Mute'}
                        onClick={(e) => {
                          e.stopPropagation();
                          AudioService.play('tap');
                          onUserInteraction?.();
                          onToggleMute();
                        }}
                      >
                        {isMuted || volume === 0 ? <VolumeX size={28} /> : <Volume2 size={28} />}
                      </button>

                      <input
                        type="range"
                        aria-label="Volume"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        className={styles.volumeSlider}
                        onPointerDown={stopSurfacePropagation}
                        onPointerUp={stopSurfacePropagation}
                        onChange={(e) => {
                          onUserInteraction?.();
                          onVolumeChange(parseFloat(e.target.value));
                        }}
                      />
                    </div>

                    {bridge.platform !== 'android' && (
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                        onClick={(e) => {
                          e.stopPropagation();
                          AudioService.play('tap');
                          onUserInteraction?.();
                          onToggleFullscreen();
                        }}
                      >
                        {isFullscreen ? <Minimize2 size={26} /> : <Maximize2 size={26} />}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </div>
      )}
    </AnimatePresence>
  );
};
