import { create } from 'zustand';
import type { ApplicationState } from '../types';
import { LOCKABLE_EVENTS, transition, type AppEvent } from '../services/AppState';
import { bridge } from '../services/bridge';

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
const ILLEGAL_LOG_COOLDOWN_MS = 1000;
const lastIllegalLogByReason = new Map<string, number>();

function clearLockTimer() {
  if (lockTimerId !== null) {
    clearTimeout(lockTimerId);
    lockTimerId = null;
  }
}

function logIllegalTransitionRateLimited(reason: string) {
  console.warn(`[AppState] ${reason}`);
  const now = Date.now();
  const prev = lastIllegalLogByReason.get(reason) ?? 0;
  if (now - prev >= ILLEGAL_LOG_COOLDOWN_MS) {
    lastIllegalLogByReason.set(reason, now);
    void bridge.logClientMessage('WARN', `[AppState] ${reason}`).catch(() => {});
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
      if (res.reason) {
        logIllegalTransitionRateLimited(res.reason);
      }
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
    lastIllegalLogByReason.clear();
    set({
      state: 'INITIALIZING',
      previousState: null,
      errorReason: null,
      isTransitionLocked: false,
    });
  },
}));
