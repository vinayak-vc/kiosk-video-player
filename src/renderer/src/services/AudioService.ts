import { useSettingsStore } from '../stores/settingsStore';

export type SfxName =
  | 'tap'
  | 'select'
  | 'galleryEntrance'
  | 'return'
  | 'slideshowTransition'
  | 'error';

export const MAX_SFX_POLYPHONY = 4;
export const MAX_SFX_DURATION_SEC = 0.38; // strictly < 400ms

export interface AudioContextLike {
  state: AudioContextState;
  currentTime: number;
  destination: AudioDestinationNode;
  resume(): Promise<void>;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  close(): Promise<void>;
}

interface ToneStep {
  freqStart: number;
  freqEnd: number;
  type: OscillatorType;
  delay: number;
  duration: number;
  peakGain: number;
}

const SOUND_RECIPES: Record<SfxName, ToneStep[]> = {
  tap: [
    { freqStart: 620, freqEnd: 420, type: 'sine', delay: 0, duration: 0.06, peakGain: 0.25 },
  ],
  select: [
    { freqStart: 440, freqEnd: 660, type: 'triangle', delay: 0, duration: 0.14, peakGain: 0.28 },
    { freqStart: 660, freqEnd: 880, type: 'sine', delay: 0.07, duration: 0.15, peakGain: 0.24 },
  ],
  galleryEntrance: [
    { freqStart: 330, freqEnd: 440, type: 'sine', delay: 0, duration: 0.18, peakGain: 0.18 },
    { freqStart: 495, freqEnd: 660, type: 'sine', delay: 0.08, duration: 0.24, peakGain: 0.16 },
  ],
  return: [
    { freqStart: 620, freqEnd: 440, type: 'sine', delay: 0, duration: 0.16, peakGain: 0.22 },
  ],
  slideshowTransition: [
    { freqStart: 392, freqEnd: 523.25, type: 'sine', delay: 0, duration: 0.26, peakGain: 0.16 },
  ],
  error: [
    { freqStart: 220, freqEnd: 180, type: 'triangle', delay: 0, duration: 0.12, peakGain: 0.26 },
    { freqStart: 180, freqEnd: 140, type: 'triangle', delay: 0.12, duration: 0.14, peakGain: 0.24 },
  ],
};

export type AudioContextFactory = () => AudioContextLike | null;

function defaultContextFactory(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export class KioskAudioService {
  private ctx: AudioContextLike | null = null;
  private masterGain: GainNode | null = null;
  private activeVoices = 0;
  private readonly contextFactory: AudioContextFactory;

  constructor(contextFactory: AudioContextFactory = defaultContextFactory) {
    this.contextFactory = contextFactory;
  }

  private ensureContext(): AudioContextLike | null {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
      if (this.ctx) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = useSettingsStore.getState().sfxVolume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    return this.ctx;
  }

  /** Resumes the shared AudioContext on first user pointer gesture. */
  async resumeOnGesture(): Promise<void> {
    const { config } = useSettingsStore.getState();
    if (!config.sfx_enabled) return;

    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignore browser autoplay rejection before gesture
      }
    }
  }

  play(sound: SfxName): boolean {
    const { config, sfxVolume } = useSettingsStore.getState();
    if (!config.sfx_enabled || sfxVolume <= 0) {
      return false;
    }

    if (this.activeVoices >= MAX_SFX_POLYPHONY) {
      return false;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) {
      return false;
    }

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    this.masterGain.gain.value = Math.max(0, Math.min(1, sfxVolume));

    const steps = SOUND_RECIPES[sound];
    const now = ctx.currentTime;

    for (const step of steps) {
      if (this.activeVoices >= MAX_SFX_POLYPHONY) break;

      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const start = now + step.delay;
      const clampedDuration = Math.min(step.duration, MAX_SFX_DURATION_SEC);
      const end = start + clampedDuration;
      const attack = Math.min(0.015, clampedDuration * 0.25);

      osc.type = step.type;
      osc.frequency.setValueAtTime(step.freqStart, start);
      if (step.freqEnd !== step.freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, step.freqEnd), end);
      }

      // Gentle ramp envelope to avoid clicks
      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(step.peakGain, start + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(env);
      env.connect(this.masterGain);

      this.activeVoices += 1;
      osc.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
        try {
          osc.disconnect();
          env.disconnect();
        } catch {
          // ignore cleanup errors on already-disconnected nodes
        }
      };

      osc.start(start);
      osc.stop(end + 0.01);
    }

    return true;
  }

  getActiveVoiceCount(): number {
    return this.activeVoices;
  }

  async dispose(): Promise<void> {
    this.activeVoices = 0;
    if (this.ctx) {
      const toClose = this.ctx;
      this.ctx = null;
      this.masterGain = null;
      await toClose.close().catch(() => {});
    }
  }
}

export const AudioService = new KioskAudioService();
