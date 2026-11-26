import React from 'react';
import type { MediaItem } from '../types';
import type { KioskAnimationPresets } from '../services/AnimationService';
import { MediaCard } from './MediaCard';
import styles from './MediaGrid.module.css';

export interface MediaGridProps {
  items: MediaItem[];
  presets: KioskAnimationPresets;
  onSelectMedia: (id: string) => void;
  stageSize?: GridStageSize;
  /** Total page capacity (e.g. min(cardsPerPage, totalItems)) so card size stays constant across pages. */
  layoutCapacity?: number;
}

export interface GridStageSize {
  width: number;
  height: number;
}

/**
 * Available grid area inside the 1920x1080 design stage after
 * container padding (40px L/R, 40px T, 28px B), heading, nav buttons (2x76px + 2x16px gaps), and footer.
 */
export const DEFAULT_GRID_STAGE_SIZE: GridStageSize = {
  width: 1656,
  height: 850,
};

export const MIN_CARD_WIDTH_PX = 260;
export const MIN_CARD_HEIGHT_PX = 180;
export const MAX_CARD_WIDTH_PX = 380;

export interface GridLayoutInfo {
  rows: number;
  columns: number;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  totalWidth: number;
  totalHeight: number;
  titleFontSize: number;
}

function resolveGridDimensions(n: number): { rows: number; columns: number } {
  if (n <= 0) return { rows: 1, columns: 1 };
  if (n <= 3) return { rows: 1, columns: n };
  if (n === 4) return { rows: 2, columns: 2 };
  if (n <= 6) return { rows: 2, columns: 3 };
  if (n <= 8) return { rows: 2, columns: 4 };
  if (n <= 10) return { rows: 2, columns: 5 };
  if (n <= 12) return { rows: 3, columns: 4 };
  if (n <= 15) return { rows: 3, columns: 5 };
  if (n <= 18) return { rows: 3, columns: 6 };
  if (n <= 20) return { rows: 4, columns: 5 };
  return { rows: 4, columns: 6 };
}

/**
 * Pure adaptive layout solver for n = 1..24 cards:
 * - Maps n to balanced rows x columns (4->2x2? n<=4 is 1 row, 6->3x2, 8->4x2, 10->5x2, 12->4x3, 15->5x3, 18->6x3, 20->5x4, 24->6x4)
 * - Computes cardWidth & cardHeight (16:11 aspect) fitting within stageSize with zero overlap/overflow
 */
export function computeGridLayout(
  visibleCount: number,
  stageSize: GridStageSize = DEFAULT_GRID_STAGE_SIZE
): GridLayoutInfo {
  const { rows, columns } = resolveGridDimensions(visibleCount);
  const gap = columns >= 6 || rows >= 4 ? 16 : columns >= 5 || rows >= 3 ? 20 : 24;

  const maxCardW = Math.floor((stageSize.width - Math.max(0, columns - 1) * gap) / columns);
  const maxCardH = Math.floor((stageSize.height - Math.max(0, rows - 1) * gap) / rows);
  const widthFromHeight = Math.floor((maxCardH * 16) / 11);

  const rawWidth = Math.min(MAX_CARD_WIDTH_PX, maxCardW, widthFromHeight);
  const cardWidth = Math.max(1, rawWidth);
  const cardHeight = Math.max(1, Math.round((cardWidth * 11) / 16));

  const totalWidth = columns * cardWidth + Math.max(0, columns - 1) * gap;
  const totalHeight = rows * cardHeight + Math.max(0, rows - 1) * gap;
  const titleFontSize = cardWidth >= 340 ? 22 : cardWidth >= 300 ? 19 : 17;

  return {
    rows,
    columns,
    cardWidth,
    cardHeight,
    gap,
    totalWidth,
    totalHeight,
    titleFontSize,
  };
}

export function computeGridColumns(visibleCount: number): number {
  return computeGridLayout(visibleCount).columns;
}

export const MediaGrid: React.FC<MediaGridProps> = React.memo(
  ({ items, presets, onSelectMedia, stageSize, layoutCapacity }) => {
    const layout = computeGridLayout(layoutCapacity ?? items.length, stageSize);

    return (
      <div
        className={styles.grid}
        style={{
          maxWidth: `${layout.totalWidth}px`,
          gap: `${layout.gap}px`,
        }}
        data-testid="media-grid"
        data-columns={layout.columns}
        data-rows={layout.rows}
        data-card-width={layout.cardWidth}
        data-card-height={layout.cardHeight}
      >
        {items.map((item, idx) => (
          <MediaCard
            key={item.id}
            item={item}
            index={idx}
            presets={presets}
            onSelect={onSelectMedia}
            cardWidth={layout.cardWidth}
            cardHeight={layout.cardHeight}
            titleFontSize={layout.titleFontSize}
          />
        ))}
      </div>
    );
  }
);

MediaGrid.displayName = 'MediaGrid';
