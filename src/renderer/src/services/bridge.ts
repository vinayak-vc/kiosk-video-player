import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ScanResult, AppConfig } from '../types';

/**
 * bridge.ts
 * The ONLY module in the entire renderer authorized to invoke Tauri commands
 * or listen for Tauri backend events.
 */
class TauriBridge {
  async getAppConfig(): Promise<AppConfig> {
    return invoke<AppConfig>('get_config');
  }

  async setMediaRoot(path: string): Promise<AppConfig> {
    return invoke<AppConfig>('set_media_root', { path });
  }

  async pickMediaFolder(): Promise<string | null> {
    return invoke<string | null>('pick_media_folder');
  }

  async validateMediaFolder(path: string): Promise<string> {
    return invoke<string>('validate_media_folder_cmd', { path });
  }

  async getMediaItems(): Promise<ScanResult> {
    return invoke<ScanResult>('get_media_items');
  }

  async logClientMessage(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
    return invoke('log_client_message', { level, message });
  }

  async exitApp(): Promise<void> {
    return invoke('exit_kiosk_app');
  }

  async requestAdmin(): Promise<void> {
    return invoke('trigger_admin_shortcut');
  }

  async toggleFullscreen(): Promise<boolean> {
    return invoke<boolean>('toggle_fullscreen');
  }

  async onAdminRequested(callback: () => void): Promise<UnlistenFn> {
    return listen('open-admin-panel', () => callback());
  }

  async onMediaChanged(callback: () => void): Promise<UnlistenFn> {
    return listen('media-changed', () => callback());
  }
}

export const bridge = new TauriBridge();
