import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Film, Play } from 'lucide-react';
import type { MediaItem } from '../types';
import type { KioskAnimationPresets } from '../services/AnimationService';
import styles from './MediaCard.module.css';

export interface MediaCardProps {
  item: MediaItem;
  index: number;
  presets: KioskAnimationPresets;
  onSelect: (id: string) => void;
}

export const MediaCard: React.FC<MediaCardProps> = React.memo(
  ({ item, index, presets, onSelect }) => {
    const [imgError, setImgError] = useState(false);

    return (
      <motion.button
        type="button"
        className={styles.card}
        aria-label={`Play ${item.display_title}`}
        variants={presets.cardEntrance(index)}
        initial="hidden"
        animate="visible"
        whileHover={presets.cardHover}
        whileTap={presets.cardPress}
        onClick={() => onSelect(item.id)}
      >
        {!imgError ? (
          <img
            src={item.thumbnail_url}
            alt={item.display_title}
            loading="lazy"
            decoding="async"
            className={styles.thumbnail}
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={styles.fallback} data-testid="card-fallback-icon">
            <Film size={54} strokeWidth={1.5} />
          </div>
        )}

        <div className={styles.scrim}>
          <span className={styles.title}>{item.display_title}</span>
          <span className={styles.playBadge} aria-hidden="true">
            <Play size={16} fill="currentColor" />
          </span>
        </div>
      </motion.button>
    );
  }
);

MediaCard.displayName = 'MediaCard';
