import { describe, it, expect } from 'vitest';
import {
  ANIMATION_DURATIONS,
  createAnimationPresets,
  AnimationService,
} from '../renderer/src/services/AnimationService';

describe('AnimationService presets', () => {
  it('exports every required preset from brief §9', () => {
    const requiredKeys = [
      'galleryEntrance',
      'galleryExit',
      'cardEntrance',
      'cardHover',
      'cardPress',
      'cardSelect',
      'playerEntrance',
      'playerExit',
      'controlReveal',
      'controlHide',
      'slideshowEntrance',
      'slideshowExit',
      'pageTransition',
      'emptyStateEntrance',
      'adminPanelEntrance',
    ] as const;

    for (const key of requiredKeys) {
      expect(AnimationService[key]).toBeDefined();
    }
  });

  it('uses 50-80ms card stagger capped per page', () => {
    expect(ANIMATION_DURATIONS.cardStaggerSeconds).toBeGreaterThanOrEqual(0.05);
    expect(ANIMATION_DURATIONS.cardStaggerSeconds).toBeLessThanOrEqual(0.08);

    const card0 = AnimationService.cardEntrance(0).visible as { transition: { delay: number } };
    const card3 = AnimationService.cardEntrance(3).visible as { transition: { delay: number } };
    expect(card0.transition.delay).toBe(0);
    expect(card3.transition.delay).toBeCloseTo(0.18, 4);
  });

  it('respects reducedMotion by collapsing transforms and durations', () => {
    const reduced = createAnimationPresets(true);
    const galleryHidden = reduced.galleryEntrance.hidden as { opacity: number; y: number };
    expect(galleryHidden.opacity).toBe(0);
    expect(galleryHidden.y).toBe(0);

    const cardVisible = reduced.cardEntrance(4).visible as { transition: { delay: number; duration: number } };
    expect(cardVisible.transition.delay).toBe(0);
    expect(cardVisible.transition.duration).toBeLessThanOrEqual(0.02);

    expect(reduced.cardHover).not.toHaveProperty('scale');
  });
});
