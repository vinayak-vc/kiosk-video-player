import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KioskAudioService,
  MAX_SFX_POLYPHONY,
  type AudioContextLike,
  type SfxName,
} from '../renderer/src/services/AudioService';
import { useSettingsStore } from '../renderer/src/stores/settingsStore';

function createFakeAudioContext() {
  const createdOscillators: Array<{
    type: OscillatorType;
    startCalls: number[];
    stopCalls: number[];
    onended: (() => void) | null;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];

  const createdGains: Array<{
    gain: {
      value: number;
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];

  const ctx: AudioContextLike = {
    state: 'suspended',
    currentTime: 1.0,
    destination: {} as AudioDestinationNode,
    resume: vi.fn().mockImplementation(async () => {
      (ctx as { state: AudioContextState }).state = 'running';
    }),
    close: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn().mockImplementation(() => {
      const node = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      createdGains.push(node);
      return node as unknown as GainNode;
    }),
    createOscillator: vi.fn().mockImplementation(() => {
      const osc = {
        type: 'sine' as OscillatorType,
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        startCalls: [] as number[],
        stopCalls: [] as number[],
        onended: null as (() => void) | null,
        start: vi.fn((t: number) => osc.startCalls.push(t)),
        stop: vi.fn((t: number) => osc.stopCalls.push(t)),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      createdOscillators.push(osc);
      return osc as unknown as OscillatorNode;
    }),
  };

  return { ctx, createdOscillators, createdGains };
}

describe('KioskAudioService (Web Audio SFX)', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset();
  });

  it('plays nothing when SFX_ENABLED is false', () => {
    const fake = createFakeAudioContext();
    const factory = vi.fn(() => fake.ctx);
    const audio = new KioskAudioService(factory);

    useSettingsStore.getState().setSfxEnabled(false);
    expect(audio.play('tap')).toBe(false);
    expect(audio.play('select')).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(fake.createdOscillators).toHaveLength(0);
  });

  it('schedules all 6 sounds under 400ms with gentle gain envelopes', () => {
    const fake = createFakeAudioContext();
    const audio = new KioskAudioService(() => fake.ctx);

    const sounds: SfxName[] = [
      'tap',
      'select',
      'galleryEntrance',
      'return',
      'slideshowTransition',
      'error',
    ];

    for (const sfx of sounds) {
      // Clear voices between sounds
      for (const osc of fake.createdOscillators) {
        osc.onended?.();
      }
      expect(audio.play(sfx)).toBe(true);
    }

    expect(fake.createdOscillators.length).toBeGreaterThanOrEqual(6);
    for (const osc of fake.createdOscillators) {
      const dur = osc.stopCalls[0] - osc.startCalls[0];
      expect(dur).toBeGreaterThan(0);
      expect(dur).toBeLessThan(0.4);
    }
  });

  it('caps polyphony and releases voices onended', () => {
    const fake = createFakeAudioContext();
    const audio = new KioskAudioService(() => fake.ctx);

    for (let i = 0; i < MAX_SFX_POLYPHONY + 3; i++) {
      audio.play('tap');
    }

    expect(audio.getActiveVoiceCount()).toBe(MAX_SFX_POLYPHONY);
    expect(fake.createdOscillators).toHaveLength(MAX_SFX_POLYPHONY);

    // Finish one voice
    fake.createdOscillators[0].onended?.();
    expect(audio.getActiveVoiceCount()).toBe(MAX_SFX_POLYPHONY - 1);
    expect(audio.play('tap')).toBe(true);
  });

  it('resumes suspended AudioContext on first pointer gesture', async () => {
    const fake = createFakeAudioContext();
    const audio = new KioskAudioService(() => fake.ctx);

    expect(fake.ctx.state).toBe('suspended');
    await audio.resumeOnGesture();
    expect(fake.ctx.resume).toHaveBeenCalledTimes(1);
    expect(fake.ctx.state).toBe('running');
  });
});
