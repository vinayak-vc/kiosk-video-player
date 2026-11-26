import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GalleryScreen, slicePageItems } from '../renderer/src/screens/GalleryScreen';
import {
  computeGridLayout,
  DEFAULT_GRID_STAGE_SIZE,
  MIN_CARD_HEIGHT_PX,
  MIN_CARD_WIDTH_PX,
} from '../renderer/src/components/MediaGrid';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore, computeTotalPages } from '../renderer/src/stores/mediaStore';
import { usePlayerStore } from '../renderer/src/stores/playerStore';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';
import type { MediaItem } from '../renderer/src/types';

function makeItems(count: number): MediaItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `video-${i + 1}`,
    filename: `Video ${i + 1}.mp4`,
    display_title: `Video ${i + 1}`,
    video_path: `C:/Media/Video ${i + 1}.mp4`,
    thumbnail_path: `C:/Media/Video ${i + 1}.png`,
    video_url: `http://kiosk-media.localhost/Video%20${i + 1}.mp4`,
    thumbnail_url: `http://kiosk-media.localhost/Video%20${i + 1}.png`,
    file_size: 1024,
  }));
}

describe('Gallery pagination & grid math', () => {
  it('computes total pages and slices items accurately', () => {
    expect(computeTotalPages(0, 8)).toBe(1);
    expect(computeTotalPages(8, 8)).toBe(1);
    expect(computeTotalPages(20, 8)).toBe(3);

    const items = makeItems(20);
    expect(slicePageItems(items, 0, 8)).toHaveLength(8);
    expect(slicePageItems(items, 1, 8)).toHaveLength(8);
    expect(slicePageItems(items, 2, 8)).toHaveLength(4);
  });

  it('computes centered grid layout (rows & columns) for n=1..24 with no overflow/overlap', () => {
    expect(computeGridLayout(1)).toMatchObject({ rows: 1, columns: 1 });
    expect(computeGridLayout(2)).toMatchObject({ rows: 1, columns: 2 });
    expect(computeGridLayout(3)).toMatchObject({ rows: 1, columns: 3 });
    expect(computeGridLayout(4)).toMatchObject({ rows: 2, columns: 2 });
    expect(computeGridLayout(6)).toMatchObject({ rows: 2, columns: 3 });
    expect(computeGridLayout(8)).toMatchObject({ rows: 2, columns: 4 });
    expect(computeGridLayout(10)).toMatchObject({ rows: 2, columns: 5 });
    expect(computeGridLayout(12)).toMatchObject({ rows: 3, columns: 4 });
    expect(computeGridLayout(15)).toMatchObject({ rows: 3, columns: 5 });
    expect(computeGridLayout(18)).toMatchObject({ rows: 3, columns: 6 });
    expect(computeGridLayout(20)).toMatchObject({ rows: 4, columns: 5 });
    expect(computeGridLayout(24)).toMatchObject({ rows: 4, columns: 6 });

    for (let n = 1; n <= 24; n++) {
      const layout = computeGridLayout(n, DEFAULT_GRID_STAGE_SIZE);
      expect(layout.totalWidth).toBeLessThanOrEqual(DEFAULT_GRID_STAGE_SIZE.width);
      expect(layout.totalHeight).toBeLessThanOrEqual(DEFAULT_GRID_STAGE_SIZE.height);
      expect(layout.cardWidth).toBeGreaterThanOrEqual(MIN_CARD_WIDTH_PX);
      expect(layout.cardHeight).toBeGreaterThanOrEqual(MIN_CARD_HEIGHT_PX);
    }
  });
});

describe('GalleryScreen interactions', () => {
  beforeEach(() => {
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    usePlayerStore.getState().reset();
    useSettingsStore.getState().reset();

    // Put app state into GALLERY
    useApplicationStore.getState().dispatch('INIT_DONE');
    useApplicationStore.getState().dispatch('SCAN_OK');
  });

  it('navigates pages with Next/Prev buttons and PageIndicator dots', () => {
    useMediaStore.getState().setScanResult(
      {
        items: makeItems(28),
        ignored_orphan_count: 0,
        video_count: 28,
        image_count: 28,
        errors: [],
        root: 'C:/Media',
      },
      12
    );

    render(<GalleryScreen />);

    expect(screen.getByText('Video 1')).toBeInTheDocument();
    expect(screen.queryByText('Video 13')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(useMediaStore.getState().currentPage).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(useMediaStore.getState().currentPage).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(useMediaStore.getState().currentPage).toBe(1);
  });

  it('clamps currentPage when cards_per_page increases at runtime', () => {
    useMediaStore.getState().setScanResult(
      {
        items: makeItems(20),
        ignored_orphan_count: 0,
        video_count: 20,
        image_count: 20,
        errors: [],
        root: 'C:/Media',
      },
      6
    );
    useMediaStore.getState().setPage(3, 6);
    expect(useMediaStore.getState().currentPage).toBe(3);

    useMediaStore.getState().setPage(3, 12);
    expect(useMediaStore.getState().currentPage).toBe(1);
  });

  it('keeps card width/height/columns constant across pages based on page capacity (no size jump on partial last page)', () => {
    useMediaStore.getState().setScanResult(
      {
        items: makeItems(20),
        ignored_orphan_count: 0,
        video_count: 20,
        image_count: 20,
        errors: [],
        root: 'C:/Media',
      },
      12
    );

    render(<GalleryScreen />);
    const gridPage0 = screen.getByTestId('media-grid');
    const w0 = gridPage0.getAttribute('data-card-width');
    const h0 = gridPage0.getAttribute('data-card-height');
    const cols0 = gridPage0.getAttribute('data-columns');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    const gridPage1 = screen.getByTestId('media-grid');
    expect(gridPage1.getAttribute('data-card-width')).toBe(w0);
    expect(gridPage1.getAttribute('data-card-height')).toBe(h0);
    expect(gridPage1.getAttribute('data-columns')).toBe(cols0);
  });

  it('supports horizontal swipe (>=80px) and ignores vertical drag', () => {
    useMediaStore.getState().setScanResult(
      {
        items: makeItems(20),
        ignored_orphan_count: 0,
        video_count: 20,
        image_count: 20,
        errors: [],
        root: 'C:/Media',
      },
      8
    );

    render(<GalleryScreen />);
    const gallery = screen.getByTestId('gallery-screen');

    // Vertical drag should NOT change page
    fireEvent.pointerDown(gallery, { clientX: 500, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(gallery, { clientX: 520, clientY: 450, pointerId: 1 });
    expect(useMediaStore.getState().currentPage).toBe(0);

    // Horizontal swipe left (-150px) -> next page (page 1)
    fireEvent.pointerDown(gallery, { clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(gallery, { clientX: 450, clientY: 310, pointerId: 1 });
    expect(useMediaStore.getState().currentPage).toBe(1);

    // Horizontal swipe right (+150px) -> previous page (page 0)
    fireEvent.pointerDown(gallery, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(gallery, { clientX: 550, clientY: 305, pointerId: 1 });
    expect(useMediaStore.getState().currentPage).toBe(0);
  });

  it('selects media on card click and transitions to INDIVIDUAL_PLAYER', () => {
    useMediaStore.getState().setScanResult(
      {
        items: makeItems(3),
        ignored_orphan_count: 0,
        video_count: 3,
        image_count: 3,
        errors: [],
        root: 'C:/Media',
      },
      8
    );

    render(<GalleryScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Video 2' }));

    expect(usePlayerStore.getState().selectedMediaId).toBe('video-2');
    expect(useApplicationStore.getState().state).toBe('INDIVIDUAL_PLAYER');
  });

  it('does not set selectedMediaId when dispatch is rejected by transition lock', () => {
    useMediaStore.getState().setScanResult(
      {
        items: makeItems(3),
        ignored_orphan_count: 0,
        video_count: 3,
        image_count: 3,
        errors: [],
        root: 'C:/Media',
      },
      8
    );

    useApplicationStore.getState().beginTransition(500);
    render(<GalleryScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Video 1' }));

    expect(usePlayerStore.getState().selectedMediaId).toBeNull();
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('does not trigger card selection when a click follows a horizontal swipe', () => {
    useMediaStore.getState().setScanResult(
      {
        items: makeItems(20),
        ignored_orphan_count: 0,
        video_count: 20,
        image_count: 20,
        errors: [],
        root: 'C:/Media',
      },
      12
    );

    render(<GalleryScreen />);
    const gallery = screen.getByTestId('gallery-screen');

    fireEvent.pointerDown(gallery, { clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(gallery, { clientX: 440, clientY: 305, pointerId: 1 });
    expect(useMediaStore.getState().currentPage).toBe(1);

    // Browser fires trailing click on card underneath pointerUp
    fireEvent.click(screen.getByRole('button', { name: 'Play Video 1' }));
    expect(usePlayerStore.getState().selectedMediaId).toBeNull();
    expect(useApplicationStore.getState().state).toBe('GALLERY');
  });

  it('shows fallback tile on thumbnail error while keeping title visible', () => {
    useMediaStore.getState().setScanResult(
      {
        items: makeItems(1),
        ignored_orphan_count: 0,
        video_count: 1,
        image_count: 1,
        errors: [],
        root: 'C:/Media',
      },
      8
    );

    render(<GalleryScreen />);
    const img = screen.getByAltText('Video 1');
    fireEvent.error(img);

    expect(screen.getByTestId('card-fallback-icon')).toBeInTheDocument();
    expect(screen.getByText('Video 1')).toBeInTheDocument();
  });
});
