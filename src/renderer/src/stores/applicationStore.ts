import { create } from 'zustand';
import type { ApplicationState } from '../types';
import { LOCKABLE_EVENTS, transition, type AppEvent } from '../services/AppState';

export interface DispatchOptions {
  errorReason?: string | null;
  lockDurationMs?: number;
}

export interface ApplicationStoreState {
  state: ApplicationState;
  previousState: ApplicationState | null;
  errorReason: string | null;
  isTransitionLocked: boolean;
  dispatch: (event: AppEvent, options?: DispatchOptions) => boolean;
  beginTransition: (durationMs: number) => void;
  releaseTransition: () => void;
  reset: () => void;
}

let lockTimerId: ReturnType<typeof setTimeout> | null = null;

function clearLockTimer() {
  if (lockTimerId !== null) {
    clearTimeout(lockTimerId);
    lockTimerId = null;
  }
}

export const useApplicationStore = create<ApplicationStoreState>((set, get) => ({
  state: 'INITIALIZING',
  previousState: null,
  errorReason: null,
  isTransitionLocked: false,

  beginTransition: (durationMs: number) => {
    clearLockTimer();
    if (durationMs <= 0) {
      set({ isTransitionLocked: false });
      return;
    }
    set({ isTransitionLocked: true });
    lockTimerId = setTimeout(() => {
      lockTimerId = null;
      set({ isTransitionLocked: false });
    }, durationMs);
  },

  releaseTransition: () => {
    clearLockTimer();
    set({ isTransitionLocked: false });
  },

  dispatch: (event: AppEvent, options?: DispatchOptions) => {
    const current = get();

    if (current.isTransitionLocked && LOCKABLE_EVENTS.has(event)) {
      console.debug(`[AppState] Ignored ${event} while transition locked (${current.state})`);
      return false;
    }

    const res = transition(current.state, event);
    if (!res.accepted) {
      console.warn(`[AppState] ${res.reason}`);
      return false;
    }

    const nextErrorReason =
      res.nextState === 'ERROR'
        ? (options?.errorReason ?? current.errorReason ?? 'Unknown error')
        : res.nextState === 'GALLERY' || res.nextState === 'SCANNING_MEDIA'
          ? null
          : current.errorReason;

    set({
      state: res.nextState,
      previousState: current.state,
      errorReason: nextErrorReason,
    });

    if (options?.lockDurationMs && options.lockDurationMs > 0) {
      get().beginTransition(options.lockDurationMs);
    }

    return true;
  },

  reset: () => {
    clearLockTimer();
    set({
      state: 'INITIALIZING',
      previousState: null,
      errorReason: null,
      isTransitionLocked: false,
    });
  },
}));
