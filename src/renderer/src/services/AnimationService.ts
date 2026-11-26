import type { Transition, Variants, TargetAndTransition } from 'framer-motion';

export const ANIMATION_DURATIONS = {
  galleryEntrance: 0.4,
  galleryExit: 0.28,
  cardStaggerSeconds: 0.06, // 60ms within 50-80ms brief target
  cardEntrance: 0.35,
  cardHover: 0.2,
  cardPress: 0.12,
  cardSelect: 0.35,
  playerEntrance: 0.38,
  playerExit: 0.28,
  controlReveal: 0.24,
  controlHide: 0.22,
  slideshowEntrance: 0.45,
  slideshowExit: 0.35,
  pageTransition: 0.3,
  emptyStateEntrance: 0.35,
  adminPanelEntrance: 0.28,
} as const;

export const KIOSK_EASE = [0.22, 1, 0.36, 1] as const;

export interface KioskAnimationPresets {
  galleryEntrance: Variants;
  galleryExit: Variants;
  cardEntrance: (index: number) => Variants;
  cardHover: TargetAndTransition;
  cardPress: TargetAndTransition;
  cardSelect: Variants;
  playerEntrance: Variants;
  playerExit: Variants;
  controlReveal: Variants;
  controlHide: Variants;
  slideshowEntrance: Variants;
  slideshowExit: Variants;
  pageTransition: Variants;
  emptyStateEntrance: Variants;
  adminPanelEntrance: Variants;
  transitions: {
    standard: Transition;
    fast: Transition;
    layout: Transition;
  };
}

/**
 * Builds the complete set of Framer Motion presets for the kiosk UI.
 * Uses only GPU-composited `opacity`, `transform` (`scale`, `x`, `y`), and small controlled `filter: blur()`.
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

    transitions: {
      standard: standardTransition,
      fast: fastTransition,
      layout: layoutTransition,
    },
  };
}

export const AnimationService = createAnimationPresets(false);
