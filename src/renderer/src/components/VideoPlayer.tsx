import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import type { MediaItem } from '../types';
import { useAnimationPresets } from '../hooks/useAnimationPresets';
import { useVideoPlayback } from '../hooks/useVideoPlayback';
import { usePlayerInteraction } from '../hooks/usePlayerInteraction';
import { AudioService } from '../services/AudioService';
import { IdleTimerService } from '../services/IdleTimerService';
import { bridge } from '../services/bridge';
import { useApplicationStore } from '../stores/applicationStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { PlayerControls } from './PlayerControls';
import styles from './VideoPlayer.module.css';

export interface VideoPlayerProps {
  item: MediaItem;
  onExit?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ item, onExit }) => {
  const presets = useAnimationPresets();
  const [isFullscreen, setIsFullscreen] = useState(true);

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const controlsVisible = usePlayerStore((s) => s.controlsVisible);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);

  const handleBackToGallery = useCallback(() => {
    AudioService.play('return');
    usePlayerStore.getState().clearSelection();
    if (onExit) {
      onExit();
    } else {
      useApplicationStore.getState().dispatch('PLAYER_EXIT', { lockDurationMs: 400 });
    }
  }, [onExit]);

  const handleEnded = useCallback(() => {
    const returnOnEnd = useSettingsStore.getState().config.return_to_gallery_on_end;
    if (returnOnEnd) {
      AudioService.play('return');
      usePlayerStore.getState().clearSelection();
      useApplicationStore.getState().dispatch('VIDEO_ENDED', { lockDurationMs: 450 });
      IdleTimerService.reset();
    } else {
      usePlayerStore.getState().setPlaying(false);
      usePlayerStore.getState().setControlsVisible(true);
    }
  }, []);

  const { videoRef, isReady, isDurationKnown, playbackError } = useVideoPlayback({
    mediaId: item.id,
    videoUrl: item.video_url,
    autoPlay: true,
    onEnded: handleEnded,
  });

  const { surfaceHandlers, resetAutoHideTimer } = usePlayerInteraction({
    videoRef,
    isPlaying,
    controlsVisible,
    disabled: Boolean(playbackError),
  });

  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void Promise.resolve(video.play()).catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef]);

  const handleSeek = useCallback(
    (timeSeconds: number) => {
      const video = videoRef.current;
      if (!video || !isDurationKnown) return;
      const clamped = Math.max(0, Math.min(timeSeconds, duration));
      video.currentTime = clamped;
      usePlayerStore.getState().setProgress(clamped, duration);
    },
    [videoRef, isDurationKnown, duration]
  );

  const handleVolumeChange = useCallback(
    (nextVol: number) => {
      const clamped = Math.max(0, Math.min(1, nextVol));
      usePlayerStore.getState().setVolume(clamped);
      if (clamped > 0 && usePlayerStore.getState().isMuted) {
        usePlayerStore.getState().setMuted(false);
        if (videoRef.current) videoRef.current.muted = false;
      }
      if (videoRef.current) {
        videoRef.current.volume = clamped;
      }
    },
    [videoRef]
  );

  const handleToggleMute = useCallback(() => {
    const nextMuted = !usePlayerStore.getState().isMuted;
    usePlayerStore.getState().setMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  }, [videoRef]);

  const handleToggleFullscreen = useCallback(() => {
    void Promise.resolve(bridge.toggleFullscreen())
      .then((next) => {
        if (typeof next === 'boolean') setIsFullscreen(next);
      })
      .catch(() => {});
  }, []);

  return (
    <motion.section
      className={styles.playerStage}
      variants={presets.playerEntrance}
      initial="hidden"
      animate="visible"
      data-testid="video-player-screen"
      {...surfaceHandlers}
    >
      <video
        ref={videoRef}
        className={styles.videoElement}
        preload="auto"
        playsInline
        data-testid="kiosk-video-element"
      />

      {!playbackError && (
        <motion.img
          layoutId={`media-thumb-${item.id}`}
          src={item.thumbnail_url}
          alt={item.display_title}
          className={styles.posterLayer}
          animate={{ opacity: isReady ? 0 : 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      )}

      {!playbackError && (
        <PlayerControls
          title={item.display_title}
          visible={controlsVisible}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          isDurationKnown={isDurationKnown}
          volume={volume}
          isMuted={isMuted}
          isFullscreen={isFullscreen}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onBack={handleBackToGallery}
          onUserInteraction={resetAutoHideTimer}
        />
      )}

      {playbackError && (
        <div className={styles.errorOverlay} data-testid="player-error-overlay">
          <div className={styles.errorCard}>
            <div className={styles.errorIcon}>
              <AlertTriangle size={40} />
            </div>
            <h2 className={styles.errorTitle}>{item.display_title}</h2>
            <p className={styles.errorMessage}>{playbackError}</p>
            <button
              type="button"
              className={styles.backButton}
              onClick={handleBackToGallery}
            >
              <ArrowLeft size={20} />
              Back to gallery
            </button>
          </div>
        </div>
      )}
    </motion.section>
  );
};
