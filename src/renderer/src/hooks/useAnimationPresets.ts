import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { createAnimationPresets, type KioskAnimationPresets } from '../services/AnimationService';

/**
 * Returns memoized Framer Motion presets synchronized with OS/browser `prefers-reduced-motion`.
 */
export function useAnimationPresets(): KioskAnimationPresets {
  const reducedMotion = Boolean(useReducedMotion());
  return useMemo(() => createAnimationPresets(reducedMotion), [reducedMotion]);
}

/**
 * Detects whether the primary input device supports true hover (`(hover: hover)`),
 * preventing sticky hover states on touch-only kiosks.
 */
export function useHoverCapable(): boolean {
  const [hoverCapable, setHoverCapable] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia('(hover: hover)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(hover: hover)');
    const onChange = (e: MediaQueryListEvent) => setHoverCapable(e.matches);
    setHoverCapable(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return hoverCapable;
}
