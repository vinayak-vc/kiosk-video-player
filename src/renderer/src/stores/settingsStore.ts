import { create } from 'zustand';
import type { AppConfig } from '../types';
import { bridge } from '../services/bridge';

export const DEFAULT_APP_CONFIG: AppConfig = {
  kiosk_media_root: 'C:/Kiosk/Media',
  idle_timeout_seconds: 60,
  controls_auto_hide_seconds: 4,
  slideshow_mode: 'shuffle',
  cards_per_page: 8,
  sfx_enabled: true,
  return_to_gallery_on_end: true,
};

export interface SettingsStoreState {
  config: AppConfig;
  isLoaded: boolean;
  sfxVolume: number;
  loadConfig: () => Promise<AppConfig>;
  setMediaRoot: (path: string) => Promise<AppConfig>;
  setSfxEnabled: (enabled: boolean) => void;
  setSfxVolume: (volume: number) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  config: DEFAULT_APP_CONFIG,
  isLoaded: false,
  sfxVolume: 0.7,

  loadConfig: async () => {
    const config = await bridge.getAppConfig();
    set({ config, isLoaded: true });
    return config;
  },

  setMediaRoot: async (path: string) => {
    const config = await bridge.setMediaRoot(path);
    set({ config, isLoaded: true });
    return config;
  },

  setSfxEnabled: (enabled: boolean) =>
    set((s) => ({ config: { ...s.config, sfx_enabled: enabled } })),

  setSfxVolume: (volume: number) =>
    set({ sfxVolume: Math.max(0, Math.min(1, volume)) }),

  reset: () =>
    set({
      config: DEFAULT_APP_CONFIG,
      isLoaded: false,
      sfxVolume: 0.7,
    }),
}));
