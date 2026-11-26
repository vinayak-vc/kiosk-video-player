import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  ANIMATION_DURATIONS,
  createAnimationPresets,
  AnimationService,
} from '../renderer/src/services/AnimationService';
import { useAnimationPresets } from '../renderer/src/hooks/useAnimationPresets';

describe('AnimationService presets', () => {
  it('exports every required preset from brief §9 including cardAmbientGlow and focusPulse', () => {
    const requiredKeys = [
      'galleryEntrance',
      'galleryExit',
      'cardEntrance',
      'cardHover',
      'cardPress',
      'cardSelect',
      'focusPulse',
      'playerEntrance',
      'playerExit',
      'controlReveal',
      'controlHide',
      'slideshowEntrance',
      'slideshowExit',
      'pageTransition',
      'emptyStateEntrance',
      'adminPanelEntrance',
      'cardAmbientGlow',
    ] as const;

    for (const key of requiredKeys) {
      expect(AnimationService[key]).toBeDefined();
    }
    expect(AnimationService.cardAmbientGlow.boxShadow).toBeTruthy();
  });

  it('keeps all durations within brief §9 suggested ranges', () => {
    expect(ANIMATION_DURATIONS.galleryEntrance).toBeGreaterThanOrEqual(0.45);
    expect(ANIMATION_DURATIONS.galleryEntrance).toBeLessThanOrEqual(0.65);
    expect(ANIMATION_DURATIONS.galleryExit).toBeGreaterThanOrEqual(0.45);
    expect(ANIMATION_DURATIONS.galleryExit).toBeLessThanOrEqual(0.65);

    expect(ANIMATION_DURATIONS.playerEntrance).toBeGreaterThanOrEqual(0.4);
    expect(ANIMATION_DURATIONS.playerEntrance).toBeLessThanOrEqual(0.6);
    expect(ANIMATION_DURATIONS.playerExit).toBeGreaterThanOrEqual(0.4);
    expect(ANIMATION_DURATIONS.playerExit).toBeLessThanOrEqual(0.6);

    expect(ANIMATION_DURATIONS.controlReveal).toBeGreaterThanOrEqual(0.2);
    expect(ANIMATION_DURATIONS.controlReveal).toBeLessThanOrEqual(0.3);
    expect(ANIMATION_DURATIONS.controlHide).toBeGreaterThanOrEqual(0.2);
    expect(ANIMATION_DURATIONS.controlHide).toBeLessThanOrEqual(0.3);

    expect(ANIMATION_DURATIONS.slideshowEntrance).toBeGreaterThanOrEqual(0.5);
    expect(ANIMATION_DURATIONS.slideshowEntrance).toBeLessThanOrEqual(0.8);
    expect(ANIMATION_DURATIONS.pageTransition).toBeCloseTo(0.3, 4);
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
    expect(cardVisible.transition.duration).toBeLessThanOrEqual(0.01);

    expect(reduced.cardHover).not.toHaveProperty('scale');
  });

  it('useAnimationPresets returns reduced presets when prefers-reduced-motion is true', () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      const { result } = renderHook(() => useAnimationPresets());
      const hidden = result.current.galleryEntrance.hidden as { y: number };
      const visible = result.current.galleryEntrance.visible as { transition: { duration: number } };
      expect(hidden.y).toBe(0);
      expect(visible.transition.duration).toBeLessThanOrEqual(0.01);
      expect(result.current.cardHover).not.toHaveProperty('scale');
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });
});
