import { create } from 'zustand';
import type { MediaItem, ScanResult, ScreensaverInfo } from '../types';
import { bridge } from '../services/bridge';

export interface MediaStoreState {
  items: MediaItem[];
  screensaver: ScreensaverInfo | null;
  ignoredOrphanCount: number;
  videoCount: number;
  imageCount: number;
  scanErrors: string[];
  root: string;
  isScanning: boolean;
  currentPage: number;
  refresh: (cardsPerPage?: number) => Promise<ScanResult>;
  setPage: (page: number, cardsPerPage: number) => void;
  clampPage: (cardsPerPage: number) => void;
  setScanResult: (result: ScanResult, cardsPerPage?: number) => void;
  reset: () => void;
}

export function computeTotalPages(itemCount: number, cardsPerPage: number): number {
  const perPage = Math.max(1, cardsPerPage);
  return Math.max(1, Math.ceil(itemCount / perPage));
}

export function clampPageIndex(page: number, itemCount: number, cardsPerPage: number): number {
  const total = computeTotalPages(itemCount, cardsPerPage);
  return Math.max(0, Math.min(page, total - 1));
}

export const useMediaStore = create<MediaStoreState>((set, get) => ({
  items: [],
  screensaver: null,
  ignoredOrphanCount: 0,
  videoCount: 0,
  imageCount: 0,
  scanErrors: [],
  root: '',
  isScanning: false,
  currentPage: 0,

  setScanResult: (result: ScanResult, cardsPerPage = 12) => {
    const currentPage = clampPageIndex(get().currentPage, result.items.length, cardsPerPage);
    set({
      items: result.items,
      screensaver: result.screensaver ?? null,
      ignoredOrphanCount: result.ignored_orphan_count,
      videoCount: result.video_count ?? 0,
      imageCount: result.image_count ?? 0,
      scanErrors: result.errors,
      root: result.root,
      isScanning: false,
      currentPage,
    });
  },

  refresh: async (cardsPerPage = 8) => {
    set({ isScanning: true });
    try {
      const result = await bridge.getMediaItems();
      get().setScanResult(result, cardsPerPage);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        isScanning: false,
        scanErrors: [msg],
      });
      throw err;
    }
  },

  setPage: (page: number, cardsPerPage: number) => {
    const clamped = clampPageIndex(page, get().items.length, cardsPerPage);
    set({ currentPage: clamped });
  },

  clampPage: (cardsPerPage: number) => {
    const clamped = clampPageIndex(get().currentPage, get().items.length, cardsPerPage);
    if (clamped !== get().currentPage) {
      set({ currentPage: clamped });
    }
  },

  reset: () => {
    set({
      items: [],
      screensaver: null,
      ignoredOrphanCount: 0,
      videoCount: 0,
      imageCount: 0,
      scanErrors: [],
      root: '',
      isScanning: false,
      currentPage: 0,
    });
  },
}));
