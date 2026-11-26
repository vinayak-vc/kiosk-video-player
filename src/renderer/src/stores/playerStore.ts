import { create } from 'zustand';

export interface PlayerStoreState {
  selectedMediaId: string | null;
  isPlaying: boolean;
  controlsVisible: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  selectMedia: (id: string) => void;
  clearSelection: () => void;
  setPlaying: (playing: boolean) => void;
  setControlsVisible: (visible: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerStoreState>((set) => ({
  selectedMediaId: null,
  isPlaying: false,
  controlsVisible: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,

  selectMedia: (id: string) =>
    set({
      selectedMediaId: id,
      isPlaying: true,
      controlsVisible: false,
      currentTime: 0,
      duration: 0,
    }),

  clearSelection: () =>
    set({
      selectedMediaId: null,
      isPlaying: false,
      controlsVisible: false,
      currentTime: 0,
      duration: 0,
    }),

  setPlaying: (isPlaying: boolean) => set({ isPlaying }),
  setControlsVisible: (controlsVisible: boolean) => set({ controlsVisible }),
  setProgress: (currentTime: number, duration: number) => set({ currentTime, duration }),
  setVolume: (volume: number) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  setMuted: (isMuted: boolean) => set({ isMuted }),

  reset: () =>
    set({
      selectedMediaId: null,
      isPlaying: false,
      controlsVisible: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      isMuted: false,
    }),
}));
