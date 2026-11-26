import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAnimationPresets } from '../hooks/useAnimationPresets';
import { AudioService } from '../services/AudioService';
import { useApplicationStore } from '../stores/applicationStore';
import { computeTotalPages, useMediaStore } from '../stores/mediaStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { MediaGrid } from '../components/MediaGrid';
import { PageIndicator } from '../components/PageIndicator';
import styles from './GalleryScreen.module.css';

export const GALLERY_HEADING = {
  prefix: 'Explore Our',
  highlight: 'Amazing Content',
} as const;

export const SWIPE_THRESHOLD_PX = 80;

export function slicePageItems<T>(items: T[], currentPage: number, cardsPerPage: number): T[] {
  const perPage = Math.max(1, cardsPerPage);
  const start = currentPage * perPage;
  return items.slice(start, start + perPage);
}

export const GalleryScreen: React.FC = () => {
  const items = useMediaStore((s) => s.items);
  const currentPage = useMediaStore((s) => s.currentPage);
  const setPage = useMediaStore((s) => s.setPage);
  const cardsPerPage = useSettingsStore((s) => s.config.cards_per_page);
  const dispatch = useApplicationStore((s) => s.dispatch);
  const isTransitionLocked = useApplicationStore((s) => s.isTransitionLocked);
  const selectMedia = usePlayerStore((s) => s.selectMedia);

  const presets = useAnimationPresets();

  const [direction, setDirection] = useState(1);

  const totalPages = computeTotalPages(items.length, cardsPerPage);
  const pageItems = useMemo(
    () => slicePageItems(items, currentPage, cardsPerPage),
    [items, currentPage, cardsPerPage]
  );

  // Pointer-event swipe tracking
  const swipeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const didSwipeRef = useRef(false);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (nextPage < 0 || nextPage >= totalPages || nextPage === currentPage) return;
      setDirection(nextPage > currentPage ? 1 : -1);
      AudioService.play('tap');
      setPage(nextPage, cardsPerPage);
    },
    [totalPages, currentPage, setPage, cardsPerPage]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        goToPage(currentPage + 1);
      } else if (e.key === 'ArrowLeft') {
        goToPage(currentPage - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToPage, currentPage]);

  const handleSelectMedia = useCallback(
    (id: string) => {
      if (didSwipeRef.current) {
        didSwipeRef.current = false;
        return;
      }
      if (isTransitionLocked) return;

      const accepted = dispatch('SELECT_MEDIA', { lockDurationMs: 400 });
      if (!accepted) return;

      AudioService.play('select');
      selectMedia(id);
    },
    [isTransitionLocked, selectMedia, dispatch]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    void AudioService.resumeOnGesture();
    didSwipeRef.current = false;
    swipeStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.pointerId !== e.pointerId) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    // Require horizontal swipe >= 80px and clearly horizontal (ignore vertical drags)
    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      didSwipeRef.current = true;
      if (dx < 0) {
        goToPage(currentPage + 1);
      } else {
        goToPage(currentPage - 1);
      }
    }
  };

  const handlePointerCancel = () => {
    swipeStartRef.current = null;
  };

  return (
    <motion.section
      className={styles.galleryContainer}
      variants={presets.galleryEntrance}
      initial="hidden"
      animate="visible"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      data-testid="gallery-screen"
    >
      <div className={styles.ambientGlowTop} aria-hidden="true" />

      <header className={styles.header}>
        <h1 className={styles.heading}>
          {GALLERY_HEADING.prefix}{' '}
          <span className={styles.headingHighlight}>{GALLERY_HEADING.highlight}</span>
        </h1>
      </header>

      <div className={styles.stageBody}>
        {totalPages > 1 && (
          <button
            type="button"
            className={styles.navButton}
            aria-label="Previous page"
            disabled={currentPage <= 0}
            onClick={() => goToPage(currentPage - 1)}
          >
            <ChevronLeft size={36} />
          </button>
        )}

        <div className={styles.gridViewport}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentPage}
              custom={direction}
              variants={presets.pageTransition}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <MediaGrid
                items={pageItems}
                presets={presets}
                onSelectMedia={handleSelectMedia}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {totalPages > 1 && (
          <button
            type="button"
            className={styles.navButton}
            aria-label="Next page"
            disabled={currentPage >= totalPages - 1}
            onClick={() => goToPage(currentPage + 1)}
          >
            <ChevronRight size={36} />
          </button>
        )}
      </div>

      <footer className={styles.footer}>
        <PageIndicator
          totalPages={totalPages}
          currentPage={currentPage}
          onSelectPage={goToPage}
        />
      </footer>
    </motion.section>
  );
};
