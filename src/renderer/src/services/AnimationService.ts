import type { CSSProperties } from 'react';
import type { Transition, Variants, TargetAndTransition } from 'framer-motion';

/**
 * AnimationService.ts
 * Single reusable preset module for all animations in brief §9.
 *
 * STRICT PERFORMANCE RULE:
 * No preset in this module may animate `width`, `height`, `top`, `left`, or `box-shadow`.
 * Only GPU-composited `opacity` and `transform` (`scale`, `x`, `y`) are animated.
 */

export const ANIMATION_DURATIONS = {
  galleryEntrance: 0.5, // brief §9: 450-650ms
  galleryExit: 0.45, // brief §9: 450-650ms
  cardStaggerSeconds: 0.06, // brief §9: 50-80ms
  cardEntrance: 0.35,
  cardHover: 0.2,
  cardPress: 0.12,
  cardSelect: 0.35,
  playerEntrance: 0.45, // brief §9: 400-600ms
  playerExit: 0.4, // brief §9: 400-600ms
  controlReveal: 0.25, // brief §9: 200-300ms
  controlHide: 0.22, // brief §9: 200-300ms
  slideshowEntrance: 0.5, // brief §9: 500-800ms
  slideshowExit: 0.4,
  pageTransition: 0.3, // brief §9: 300ms
  emptyStateEntrance: 0.35,
  adminPanelEntrance: 0.28,
} as const;

export const KIOSK_EASE = [0.22, 1, 0.36, 1] as const;

/** Static ambient glow style token (never animated). */
export const cardAmbientGlow: CSSProperties = {
  boxShadow:
    '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 22px rgba(0, 128, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
};

export interface KioskAnimationPresets {
  galleryEntrance: Variants;
  galleryExit: Variants;
  cardEntrance: (index: number) => Variants;
  cardHover: TargetAndTransition;
  cardPress: TargetAndTransition;
  cardSelect: Variants;
  focusPulse: Variants;
  playerEntrance: Variants;
  playerExit: Variants;
  controlReveal: Variants;
  controlHide: Variants;
  slideshowEntrance: Variants;
  slideshowExit: Variants;
  pageTransition: Variants;
  emptyStateEntrance: Variants;
  adminPanelEntrance: Variants;
  cardAmbientGlow: CSSProperties;
  transitions: {
    standard: Transition;
    fast: Transition;
    layout: Transition;
  };
}

/**
 * Builds the complete set of Framer Motion presets for the kiosk UI.
 * When `reducedMotion` is true, spatial transforms and durations collapse to instant/opacity-only transitions.
 */
export function createAnimationPresets(reducedMotion: boolean): KioskAnimationPresets {
  const dur = (seconds: number) => (reducedMotion ? 0.01 : seconds);

  const standardTransition: Transition = {
    duration: dur(ANIMATION_DURATIONS.galleryEntrance),
    ease: KIOSK_EASE,
  };

  const fastTransition: Transition = {
    duration: dur(ANIMATION_DURATIONS.cardHover),
    ease: KIOSK_EASE,
  };

  const layoutTransition: Transition = {
    duration: dur(ANIMATION_DURATIONS.cardSelect),
    ease: KIOSK_EASE,
  };

  return {
    galleryEntrance: {
      hidden: { opacity: 0, y: reducedMotion ? 0 : 18 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: dur(ANIMATION_DURATIONS.galleryEntrance), ease: KIOSK_EASE },
      },
    },

    galleryExit: {
      visible: { opacity: 1, scale: 1 },
      exit: {
        opacity: 0,
        scale: reducedMotion ? 1 : 0.97,
        transition: { duration: dur(ANIMATION_DURATIONS.galleryExit), ease: KIOSK_EASE },
      },
    },

    cardEntrance: (index: number): Variants => ({
      hidden: {
        opacity: 0,
        y: reducedMotion ? 0 : 20,
        scale: reducedMotion ? 1 : 0.96,
      },
      visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          duration: dur(ANIMATION_DURATIONS.cardEntrance),
          delay: reducedMotion ? 0 : Math.min(index, 7) * ANIMATION_DURATIONS.cardStaggerSeconds,
          ease: KIOSK_EASE,
        },
      },
    }),

    cardHover: reducedMotion
      ? { opacity: 1 }
      : {
          scale: 1.03,
          y: -4,
          transition: { duration: ANIMATION_DURATIONS.cardHover, ease: KIOSK_EASE },
        },

    cardPress: reducedMotion
      ? { opacity: 0.92 }
      : {
          scale: 0.97,
          transition: { duration: ANIMATION_DURATIONS.cardPress, ease: KIOSK_EASE },
        },

    cardSelect: {
      idle: { opacity: 1, scale: 1 },
      selected: {
        opacity: 1,
        scale: reducedMotion ? 1 : 1.06,
        transition: { duration: dur(ANIMATION_DURATIONS.cardSelect), ease: KIOSK_EASE },
      },
    },

    focusPulse: {
      idle: { opacity: 1 },
      focused: reducedMotion
        ? { opacity: 1 }
        : {
            opacity: [0.7, 1, 0.7],
            transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          },
    },

    playerEntrance: {
      hidden: {
        opacity: 0,
        scale: reducedMotion ? 1 : 0.94,
      },
      visible: {
        opacity: 1,
        scale: 1,
        transition: { duration: dur(ANIMATION_DURATIONS.playerEntrance), ease: KIOSK_EASE },
      },
    },

    playerExit: {
      visible: { opacity: 1, scale: 1 },
      exit: {
        opacity: 0,
        scale: reducedMotion ? 1 : 0.96,
        transition: { duration: dur(ANIMATION_DURATIONS.playerExit), ease: KIOSK_EASE },
      },
    },

    controlReveal: {
      hidden: { opacity: 0, y: reducedMotion ? 0 : 12 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: dur(ANIMATION_DURATIONS.controlReveal), ease: KIOSK_EASE },
      },
    },

    controlHide: {
      visible: { opacity: 1, y: 0 },
      hidden: {
        opacity: 0,
        y: reducedMotion ? 0 : 12,
        transition: { duration: dur(ANIMATION_DURATIONS.controlHide), ease: KIOSK_EASE },
      },
    },

    slideshowEntrance: {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { duration: dur(ANIMATION_DURATIONS.slideshowEntrance), ease: 'easeOut' },
      },
    },

    slideshowExit: {
      visible: { opacity: 1 },
      exit: {
        opacity: 0,
        transition: { duration: dur(ANIMATION_DURATIONS.slideshowExit), ease: 'easeIn' },
      },
    },

    pageTransition: {
      enter: (direction: number) => ({
        opacity: 0,
        x: reducedMotion ? 0 : direction >= 0 ? 48 : -48,
      }),
      center: {
        opacity: 1,
        x: 0,
        transition: { duration: dur(ANIMATION_DURATIONS.pageTransition), ease: KIOSK_EASE },
      },
      exit: (direction: number) => ({
        opacity: 0,
        x: reducedMotion ? 0 : direction >= 0 ? -48 : 48,
        transition: { duration: dur(ANIMATION_DURATIONS.pageTransition), ease: KIOSK_EASE },
      }),
    },

    emptyStateEntrance: {
      hidden: {
        opacity: 0,
        scale: reducedMotion ? 1 : 0.97,
      },
      visible: {
        opacity: 1,
        scale: 1,
        transition: { duration: dur(ANIMATION_DURATIONS.emptyStateEntrance), ease: KIOSK_EASE },
      },
    },

    adminPanelEntrance: {
      hidden: {
        opacity: 0,
        scale: reducedMotion ? 1 : 0.96,
      },
      visible: {
        opacity: 1,
        scale: 1,
        transition: { duration: dur(ANIMATION_DURATIONS.adminPanelEntrance), ease: KIOSK_EASE },
      },
    },

    cardAmbientGlow,

    transitions: {
      standard: standardTransition,
      fast: fastTransition,
      layout: layoutTransition,
    },
  };
}

/** Static non-reduced preset instance for non-React contexts; React components should use `useAnimationPresets()`. */
export const AnimationService = createAnimationPresets(false);
