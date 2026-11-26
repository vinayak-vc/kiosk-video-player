import type { ApplicationState } from '../types';

export type AppEvent =
  | 'INIT_DONE'
  | 'SCAN_START'
  | 'SCAN_OK'
  | 'SCAN_FAIL'
  | 'SELECT_MEDIA'
  | 'VIDEO_ENDED'
  | 'PLAYER_EXIT'
  | 'IDLE_TIMEOUT'
  | 'SLIDESHOW_TAP'
  | 'ADMIN_OPEN'
  | 'ADMIN_CLOSE'
  | 'FATAL_ERROR'
  | 'RETRY';

export interface TransitionResult {
  accepted: boolean;
  nextState: ApplicationState;
  reason?: string;
}

export const TRANSITION_TABLE: Readonly<
  Record<ApplicationState, Partial<Record<AppEvent, ApplicationState>>>
> = {
  INITIALIZING: {
    INIT_DONE: 'SCANNING_MEDIA',
    FATAL_ERROR: 'ERROR',
  },
  SCANNING_MEDIA: {
    SCAN_OK: 'GALLERY',
    SCAN_FAIL: 'ERROR',
    FATAL_ERROR: 'ERROR',
  },
  GALLERY: {
    SELECT_MEDIA: 'INDIVIDUAL_PLAYER',
    IDLE_TIMEOUT: 'SLIDESHOW',
    ADMIN_OPEN: 'ADMIN_PANEL',
    SCAN_START: 'SCANNING_MEDIA',
    FATAL_ERROR: 'ERROR',
  },
  INDIVIDUAL_PLAYER: {
    VIDEO_ENDED: 'GALLERY',
    PLAYER_EXIT: 'GALLERY',
    ADMIN_OPEN: 'ADMIN_PANEL',
    FATAL_ERROR: 'ERROR',
  },
  SLIDESHOW: {
    SLIDESHOW_TAP: 'GALLERY',
    ADMIN_OPEN: 'ADMIN_PANEL',
    FATAL_ERROR: 'ERROR',
  },
  ADMIN_PANEL: {
    ADMIN_CLOSE: 'GALLERY',
    SCAN_START: 'SCANNING_MEDIA',
    FATAL_ERROR: 'ERROR',
  },
  ERROR: {
    RETRY: 'SCANNING_MEDIA',
    SCAN_START: 'SCANNING_MEDIA',
    ADMIN_OPEN: 'ADMIN_PANEL',
  },
};

export const LOCKABLE_EVENTS: ReadonlySet<AppEvent> = new Set<AppEvent>([
  'SELECT_MEDIA',
  'SLIDESHOW_TAP',
  'PLAYER_EXIT',
  'VIDEO_ENDED',
  'IDLE_TIMEOUT',
]);

/**
 * Pure, framework-free state machine reducer.
 * Rejects any transition not explicitly listed in `TRANSITION_TABLE`.
 */
export function transition(state: ApplicationState, event: AppEvent): TransitionResult {
  const allowed = TRANSITION_TABLE[state];
  const nextState = allowed?.[event];
  if (!nextState) {
    return {
      accepted: false,
      nextState: state,
      reason: `Illegal transition: ${state} + ${event}`,
    };
  }
  return {
    accepted: true,
    nextState,
  };
}
