import { describe, expect, it, vi } from 'vitest';
import {
  SCREENSAVER_TRACK_ID,
  ScreensaverStrategy,
  SequentialStrategy,
  ShuffleBagStrategy,
  SlideshowController,
} from '../renderer/src/services/SlideshowController';
import type { MediaItem, ScreensaverInfo } from '../renderer/src/types';

function makeItems(count: number): MediaItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `v${i + 1}`,
    filename: `Video ${i + 1}.mp4`,
    display_title: `Video ${i + 1}`,
    video_path: `C:/Media/Video ${i + 1}.mp4`,
    thumbnail_path: `C:/Media/Video ${i + 1}.png`,
    video_url: `http://kiosk-media.localhost/Video%20${i + 1}.mp4`,
    thumbnail_url: `http://kiosk-media.localhost/Video%20${i + 1}.png`,
    file_size: 1000 + i,
  }));
}

const sampleScreensaver: ScreensaverInfo = {
  video_path: 'C:/Media/Screensaver.mp4',
  video_url: 'http://kiosk-media.localhost/Screensaver.mp4',
  file_size: 50_000,
};

describe('Slideshow strategies (P5-2)', () => {
  it('ScreensaverStrategy always returns the screensaver item with loop=true and respects screensaverSound', () => {
    const audible = new ScreensaverStrategy(sampleScreensaver, true);
    const t1 = audible.next();
    const t2 = audible.next();
    expect(t1).toMatchObject({
      id: SCREENSAVER_TRACK_ID,
      url: sampleScreensaver.video_url,
      isScreensaver: true,
      loop: true,
      muted: false,
    });
    expect(t2).toEqual(t1);

    const muted = new ScreensaverStrategy(sampleScreensaver, false);
    expect(muted.next()?.muted).toBe(true);
  });

  it('SlideshowController falls back to shuffle with single WARN when Screensaver.mp4 is missing or fails', () => {
    const onWarn = vi.fn();
    const items = makeItems(3);
    const controller = new SlideshowController({
      mode: 'screensaver',
      items,
      screensaver: null,
      onWarn,
    });

    const first = controller.next();
    expect(first).not.toBeNull();
    expect(first?.isScreensaver).toBe(false);
    expect(controller.getEffectiveMode()).toBe('shuffle');
    expect(onWarn).toHaveBeenCalledTimes(1);

    // Subsequent calls do not spam WARN
    controller.next();
    expect(onWarn).toHaveBeenCalledTimes(1);

    // Runtime failure of Screensaver.mp4 also falls back cleanly
    const onWarn2 = vi.fn();
    const controller2 = new SlideshowController({
      mode: 'screensaver',
      items,
      screensaver: sampleScreensaver,
      onWarn: onWarn2,
    });
    expect(controller2.next()?.isScreensaver).toBe(true);
    controller2.markFailed(SCREENSAVER_TRACK_ID);
    const fallbackTrack = controller2.next();
    expect(fallbackTrack?.isScreensaver).toBe(false);
    expect(onWarn2).toHaveBeenCalledTimes(1);
  });

  it('invokes onAllFailed when no screensaver and all items fail or list is empty', () => {
    const onAllFailed = vi.fn();
    const items = makeItems(2);
    const controller = new SlideshowController({
      mode: 'shuffle',
      items,
      screensaver: null,
      onAllFailed,
    });

    const t1 = controller.next()!;
    controller.markFailed(t1.id);
    const t2 = controller.next()!;
    controller.markFailed(t2.id);

    const t3 = controller.next();
    expect(t3).toBeNull();
    expect(onAllFailed).toHaveBeenCalledTimes(1);
  });

  it('ShuffleBagStrategy visits all items before repeating and avoids consecutive repeat when >1 item', () => {
    const items = makeItems(4);
    const strategy = new ShuffleBagStrategy(items);

    const seenFirstRound = new Set<string>();
    let prevId: string | null = null;
    for (let i = 0; i < 12; i++) {
      const track = strategy.next()!;
      expect(track.id).not.toBe(prevId);
      prevId = track.id;
      if (i < 4) seenFirstRound.add(track.id);
    }
    expect(seenFirstRound.size).toBe(4);

    // Single-item list allows consecutive repeat
    const single = new ShuffleBagStrategy(makeItems(1));
    expect(single.next()?.id).toBe('v1');
    expect(single.next()?.id).toBe('v1');
  });

  it('SequentialStrategy cycles deterministically in order', () => {
    const strategy = new SequentialStrategy(makeItems(3));
    expect(strategy.next()?.id).toBe('v1');
    expect(strategy.next()?.id).toBe('v2');
    expect(strategy.next()?.id).toBe('v3');
    expect(strategy.next()?.id).toBe('v1');
  });

  describe('BT-42 Preload Contract in SlideshowController', () => {
    it('reserveNext() locks upcoming track, guaranteeing peek() === commitReserved()', () => {
      const items = makeItems(4);
      const controller = new SlideshowController({
        mode: 'sequential',
        items,
        screensaver: null,
      });

      const active = controller.commitReserved();
      expect(active?.id).toBe('v1');

      // Reserve next track
      const reserved1 = controller.reserveNext();
      expect(reserved1?.id).toBe('v2');

      // Multiple peeks return the identical locked track
      expect(controller.peek()?.id).toBe('v2');
      expect(controller.peek()?.id).toBe('v2');
      expect(controller.reserveNext()?.id).toBe('v2');

      // commitReserved returns that exact locked track and frees reservation
      const committed = controller.commitReserved();
      expect(committed?.id).toBe('v2');

      // Next reservation advances to v3
      const reserved2 = controller.reserveNext();
      expect(reserved2?.id).toBe('v3');
    });

    it('applies bag refill and no-repeat rules once at decision time', () => {
      const items = makeItems(3);
      const controller = new SlideshowController({
        mode: 'shuffle',
        items,
        screensaver: null,
      });

      const seen = new Set<string>();
      let prevId: string | null = null;
      for (let i = 0; i < 9; i++) {
        const reserved = controller.reserveNext()!;
        expect(controller.peek()).toEqual(reserved);
        expect(reserved.id).not.toBe(prevId);
        const committed = controller.commitReserved()!;
        expect(committed).toEqual(reserved);
        prevId = committed.id;
        seen.add(committed.id);
      }
      expect(seen.size).toBe(3);
    });

    it('markFailed on a reserved track clears the reservation and reserves replacement', () => {
      const items = makeItems(3);
      const controller = new SlideshowController({
        mode: 'sequential',
        items,
        screensaver: null,
      });

      controller.commitReserved(); // v1 active
      const reserved = controller.reserveNext()!; // v2 reserved
      expect(reserved.id).toBe('v2');

      // Fail v2 while reserved
      controller.markFailed('v2');

      // Next reserve/commit yields v3
      expect(controller.reserveNext()?.id).toBe('v3');
      expect(controller.commitReserved()?.id).toBe('v3');
    });
  });
});
