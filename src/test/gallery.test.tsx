import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GalleryScreen, slicePageItems } from '../renderer/src/screens/GalleryScreen';
import { computeGridColumns } from '../renderer/src/components/MediaGrid';
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

  it('computes grid columns = ceil(n/2) bounded to [1, 4]', () => {
    expect(computeGridColumns(1)).toBe(1);
    expect(computeGridColumns(2)).toBe(1);
    expect(computeGridColumns(3)).toBe(2);
    expect(computeGridColumns(5)).toBe(3);
    expect(computeGridColumns(8)).toBe(4);
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

    expect(screen.getByText('Video 1')).toBeInTheDocument();
    expect(screen.queryByText('Video 9')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(useMediaStore.getState().currentPage).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(useMediaStore.getState().currentPage).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(useMediaStore.getState().currentPage).toBe(1);
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
