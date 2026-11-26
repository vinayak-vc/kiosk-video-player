import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import type { MediaItem } from '../types';
import { useAnimationPresets } from '../hooks/useAnimationPresets';
import { useVideoPlayback } from '../hooks/useVideoPlayback';
import { AudioService } from '../services/AudioService';
import { useApplicationStore } from '../stores/applicationStore';
import { usePlayerStore } from '../stores/playerStore';
import styles from './VideoPlayer.module.css';

export interface VideoPlayerProps {
  item: MediaItem;
  onExit?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ item, onExit }) => {
  const presets = useAnimationPresets();

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
    AudioService.play('return');
    usePlayerStore.getState().clearSelection();
    useApplicationStore.getState().dispatch('VIDEO_ENDED', { lockDurationMs: 400 });
  }, []);

  const { videoRef, playbackError } = useVideoPlayback({
    mediaId: item.id,
    videoUrl: item.video_url,
    autoPlay: true,
    onEnded: handleEnded,
  });

  return (
    <motion.section
      className={styles.playerStage}
      variants={presets.playerEntrance}
      initial="hidden"
      animate="visible"
      data-testid="video-player-screen"
    >
      <video
        ref={videoRef}
        className={styles.videoElement}
        preload="auto"
        playsInline
        data-testid="kiosk-video-element"
      />

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
