import type { MediaItem, ScreensaverInfo } from '../types';

export type SlideshowMode = 'screensaver' | 'shuffle' | 'sequential';

export interface SlideshowTrack {
  id: string;
  url: string;
  title: string;
  isScreensaver: boolean;
  muted: boolean;
  loop: boolean;
}

export interface SlideshowStrategy {
  readonly mode: SlideshowMode;
  next(): SlideshowTrack | null;
  markFailed(id: string): void;
  updateMedia(
    items: MediaItem[],
    screensaver: ScreensaverInfo | null,
    screensaverSound: boolean
  ): void;
  reset(): void;
}

export const SCREENSAVER_TRACK_ID = '__screensaver__';

export class ScreensaverStrategy implements SlideshowStrategy {
  readonly mode = 'screensaver' as const;
  private screensaver: ScreensaverInfo | null;
  private screensaverSound: boolean;
  private failed = false;

  constructor(screensaver: ScreensaverInfo | null, screensaverSound = true) {
    this.screensaver = screensaver;
    this.screensaverSound = screensaverSound;
  }

  next(): SlideshowTrack | null {
    if (!this.screensaver || this.failed) {
      return null;
    }
    return {
      id: SCREENSAVER_TRACK_ID,
      url: this.screensaver.video_url,
      title: 'Screensaver',
      isScreensaver: true,
      muted: !this.screensaverSound,
      loop: true,
    };
  }

  markFailed(id: string): void {
    if (id === SCREENSAVER_TRACK_ID) {
      this.failed = true;
    }
  }

  updateMedia(
    _items: MediaItem[],
    screensaver: ScreensaverInfo | null,
    screensaverSound: boolean
  ): void {
    if (this.screensaver?.video_url !== screensaver?.video_url) {
      this.failed = false;
    }
    this.screensaver = screensaver;
    this.screensaverSound = screensaverSound;
  }

  reset(): void {
    this.failed = false;
  }
}

export class ShuffleBagStrategy implements SlideshowStrategy {
  readonly mode = 'shuffle' as const;
  private items: MediaItem[];
  private failedIds = new Set<string>();
  private bag: MediaItem[] = [];
  private lastPlayedId: string | null = null;
  private rng: () => number;

  constructor(items: MediaItem[], rng: () => number = Math.random) {
    this.items = [...items];
    this.rng = rng;
  }

  private getValidPool(): MediaItem[] {
    return this.items.filter((item) => !this.failedIds.has(item.id));
  }

  private refillBag(): void {
    const pool = this.getValidPool();
    if (pool.length === 0) {
      this.bag = [];
      return;
    }

    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Avoid consecutive repeat across bag boundaries unless only 1 item is playable
    if (shuffled.length > 1 && this.lastPlayedId && shuffled[0].id === this.lastPlayedId) {
      const swapIdx = 1 + Math.floor(this.rng() * (shuffled.length - 1));
      [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
    }

    this.bag = shuffled;
  }

  next(): SlideshowTrack | null {
    if (this.bag.length === 0) {
      this.refillBag();
    } else {
      // Prune any newly failed items from head of bag
      this.bag = this.bag.filter((item) => !this.failedIds.has(item.id));
      if (this.bag.length === 0) {
        this.refillBag();
      }
    }

    const chosen = this.bag.shift();
    if (!chosen) return null;

    this.lastPlayedId = chosen.id;
    return {
      id: chosen.id,
      url: chosen.video_url,
      title: chosen.display_title,
      isScreensaver: false,
      muted: false,
      loop: false,
    };
  }

  markFailed(id: string): void {
    this.failedIds.add(id);
    this.bag = this.bag.filter((item) => item.id !== id);
  }

  updateMedia(items: MediaItem[]): void {
    const prevIds = new Set(this.items.map((i) => i.id));
    this.items = [...items];
    const nextIds = new Set(items.map((i) => i.id));

    // Remove deleted items from bag and failedIds
    this.bag = this.bag.filter((i) => nextIds.has(i.id) && !this.failedIds.has(i.id));
    for (const id of this.failedIds) {
      if (!nextIds.has(id)) {
        this.failedIds.delete(id);
      }
    }

    // Add newly appeared items to the current bag
    for (const item of items) {
      if (!prevIds.has(item.id) && !this.failedIds.has(item.id)) {
        this.bag.push(item);
      }
    }
  }

  reset(): void {
    this.failedIds.clear();
    this.bag = [];
    this.lastPlayedId = null;
  }
}

export class SequentialStrategy implements SlideshowStrategy {
  readonly mode = 'sequential' as const;
  private items: MediaItem[];
  private failedIds = new Set<string>();
  private index = 0;

  constructor(items: MediaItem[]) {
    this.items = [...items];
  }

  next(): SlideshowTrack | null {
    const pool = this.items.filter((i) => !this.failedIds.has(i.id));
    if (pool.length === 0) return null;

    const chosen = pool[this.index % pool.length];
    this.index = (this.index + 1) % pool.length;
    return {
      id: chosen.id,
      url: chosen.video_url,
      title: chosen.display_title,
      isScreensaver: false,
      muted: false,
      loop: false,
    };
  }

  markFailed(id: string): void {
    this.failedIds.add(id);
  }

  updateMedia(items: MediaItem[]): void {
    this.items = [...items];
    const nextIds = new Set(items.map((i) => i.id));
    for (const id of this.failedIds) {
      if (!nextIds.has(id)) {
        this.failedIds.delete(id);
      }
    }
  }

  reset(): void {
    this.failedIds.clear();
    this.index = 0;
  }
}

export interface SlideshowControllerOptions {
  mode: string;
  items: MediaItem[];
  screensaver: ScreensaverInfo | null;
  screensaverSound?: boolean;
  onWarn?: (message: string) => void;
  onAllFailed?: (reason: string) => void;
  rng?: () => number;
}

export function normalizeSlideshowMode(mode: string): SlideshowMode {
  const lower = mode.trim().toLowerCase();
  if (lower === 'shuffle' || lower === 'sequential' || lower === 'screensaver') {
    return lower;
  }
  return 'screensaver';
}

export class SlideshowController {
  private configuredMode: SlideshowMode;
  private screensaverStrategy: ScreensaverStrategy;
  private shuffleStrategy: ShuffleBagStrategy;
  private sequentialStrategy: SequentialStrategy;
  private activeStrategy: SlideshowStrategy;
  private warnedFallback = false;
  private onWarn?: (message: string) => void;
  private onAllFailed?: (reason: string) => void;

  constructor(options: SlideshowControllerOptions) {
    this.configuredMode = normalizeSlideshowMode(options.mode);
    this.onWarn = options.onWarn;
    this.onAllFailed = options.onAllFailed;

    this.screensaverStrategy = new ScreensaverStrategy(
      options.screensaver,
      options.screensaverSound ?? true
    );
    this.shuffleStrategy = new ShuffleBagStrategy(options.items, options.rng);
    this.sequentialStrategy = new SequentialStrategy(options.items);
    this.activeStrategy = this.pickStrategyForMode(this.configuredMode);
  }

  private pickStrategyForMode(mode: SlideshowMode): SlideshowStrategy {
    if (mode === 'sequential') return this.sequentialStrategy;
    if (mode === 'shuffle') return this.shuffleStrategy;
    return this.screensaverStrategy;
  }

  getEffectiveMode(): SlideshowMode {
    return this.activeStrategy.mode;
  }

  next(): SlideshowTrack | null {
    let track = this.activeStrategy.next();

    if (!track && this.configuredMode === 'screensaver' && this.activeStrategy === this.screensaverStrategy) {
      if (!this.warnedFallback) {
        this.warnedFallback = true;
        this.onWarn?.('Screensaver.mp4 is missing or failed to play; falling back to shuffle slideshow');
      }
      this.activeStrategy = this.shuffleStrategy;
      track = this.activeStrategy.next();
    }

    if (!track) {
      this.onAllFailed?.('No playable videos available for slideshow');
      return null;
    }

    return track;
  }

  markFailed(id: string): void {
    this.activeStrategy.markFailed(id);
    if (id === SCREENSAVER_TRACK_ID && this.configuredMode === 'screensaver') {
      if (!this.warnedFallback) {
        this.warnedFallback = true;
        this.onWarn?.('Screensaver.mp4 failed to play; falling back to shuffle slideshow');
      }
      this.activeStrategy = this.shuffleStrategy;
    }
  }

  updateConfigAndMedia(options: {
    mode?: string;
    items?: MediaItem[];
    screensaver?: ScreensaverInfo | null;
    screensaverSound?: boolean;
  }): void {
    if (options.items !== undefined) {
      this.shuffleStrategy.updateMedia(options.items);
      this.sequentialStrategy.updateMedia(options.items);
    }
    if (options.screensaver !== undefined || options.screensaverSound !== undefined) {
      this.screensaverStrategy.updateMedia(
        options.items ?? [],
        options.screensaver ?? null,
        options.screensaverSound ?? true
      );
      if (options.screensaver) {
        this.warnedFallback = false;
      }
    }
    if (options.mode !== undefined) {
      const nextMode = normalizeSlideshowMode(options.mode);
      if (nextMode !== this.configuredMode) {
        this.configuredMode = nextMode;
        this.warnedFallback = false;
        this.activeStrategy = this.pickStrategyForMode(nextMode);
      }
    }
  }
}
