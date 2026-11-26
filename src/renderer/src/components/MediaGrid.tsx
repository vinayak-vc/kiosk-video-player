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

const CARD_WIDTH_PX = 360;
const GRID_GAP_PX = 24;

export interface GridLayoutInfo {
  rows: number;
  columns: number;
}

/**
 * Computes balanced centered grid layout:
 * - n <= 4: 1 centered row of n cards
 * - n > 4: 2 centered rows with columns = ceil(n / 2) capped at 4
 */
export function computeGridLayout(visibleCount: number): GridLayoutInfo {
  if (visibleCount <= 0) return { rows: 1, columns: 1 };
  if (visibleCount <= 4) {
    return { rows: 1, columns: visibleCount };
  }
  return {
    rows: 2,
    columns: Math.min(4, Math.ceil(visibleCount / 2)),
  };
}

export function computeGridColumns(visibleCount: number): number {
  return computeGridLayout(visibleCount).columns;
}

export const MediaGrid: React.FC<MediaGridProps> = React.memo(
  ({ items, presets, onSelectMedia }) => {
    const { rows, columns } = computeGridLayout(items.length);
    const maxWidth = columns * CARD_WIDTH_PX + Math.max(0, columns - 1) * GRID_GAP_PX;

    return (
      <div
        className={styles.grid}
        style={{ maxWidth: `${maxWidth}px` }}
        data-testid="media-grid"
        data-columns={columns}
        data-rows={rows}
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
