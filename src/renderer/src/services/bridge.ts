import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { MediaItem, AppConfig } from '../types';

/**
 * bridge.ts
 * The ONLY module in the entire renderer authorized to invoke Tauri commands
 * or listen for Tauri backend events.
 */
class TauriBridge {
  async getAppConfig(): Promise<AppConfig> {
    return invoke<AppConfig>('get_app_config');
  }

  async getMediaItems(): Promise<MediaItem[]> {
    return invoke<MediaItem[]>('get_media_items');
  }

  async logClientMessage(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
    return invoke('log_client_message', { level, message });
  }

  async exitApp(): Promise<void> {
    return invoke('exit_kiosk_app');
  }

  async onAdminRequested(callback: () => void): Promise<UnlistenFn> {
    return listen('open-admin-panel', () => callback());
  }

  async onMediaChanged(callback: () => void): Promise<UnlistenFn> {
    return listen('media-changed', () => callback());
  }
}

export const bridge = new TauriBridge();
