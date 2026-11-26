import React from 'react';
import type { MediaItem } from '../types';
import type { KioskAnimationPresets } from '../services/AnimationService';
import { MediaCard } from './MediaCard';
import styles from './MediaGrid.module.css';

export interface MediaGridProps {
  items: MediaItem[];
  presets: KioskAnimationPresets;
  onSelectMedia: (id: string) => void;
}

/**
 * Computes responsive grid columns for up to 4x2 layout:
 * ceil(n / 2) bounded to [1, 4], centering smaller sets.
 */
export function computeGridColumns(visibleCount: number): number {
  if (visibleCount <= 0) return 1;
  return Math.min(4, Math.max(1, Math.ceil(visibleCount / 2)));
}

export const MediaGrid: React.FC<MediaGridProps> = React.memo(
  ({ items, presets, onSelectMedia }) => {
    const columns = computeGridColumns(items.length);

    return (
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}
        data-testid="media-grid"
        data-columns={columns}
      >
        {items.map((item, idx) => (
          <MediaCard
            key={item.id}
            item={item}
            index={idx}
            presets={presets}
            onSelect={onSelectMedia}
          />
        ))}
      </div>
    );
  }
);

MediaGrid.displayName = 'MediaGrid';
