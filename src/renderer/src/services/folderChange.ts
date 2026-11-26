import { bridge } from './bridge';
import { IdleTimerService } from './IdleTimerService';
import { performMediaScan } from './startup';
import { useApplicationStore } from '../stores/applicationStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { AppConfig } from '../types';

export interface FolderChangeResult {
  success: boolean;
  error?: string;
  config?: AppConfig;
}

/**
 * executeFolderChangeFlow
 *
 * Implements the atomic folder-change sequence per Brief §11 and Card BT-24:
 * 1. Validate target folder before applying.
 * 2. Stop individual video player & clear selection if playing.
 * 3. Cancel idle timer.
 * 4. Update root & persist in app data (never writes .env).
 * 5. Dispatch SCAN_START to move state machine to SCANNING_MEDIA.
 * 6. Rescan new folder & rebuild collection via performMediaScan.
 * 7. On success, transitions to GALLERY and idle timer is restarted.
 */
export async function executeFolderChangeFlow(targetPath: string): Promise<FolderChangeResult> {
  const trimmed = targetPath.trim();
  if (!trimmed) {
    return { success: false, error: 'Media folder path cannot be empty' };
  }

  void bridge.logClientMessage('INFO', `Initiating folder-change flow to: ${trimmed}`);

  // 1. Validate folder before applying
  let validatedPath: string;
  try {
    validatedPath = await bridge.validateMediaFolder(trimmed);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    void bridge.logClientMessage('WARN', `Folder validation rejected '${trimmed}': ${errorMsg}`);
    return { success: false, error: `Invalid media folder: ${errorMsg}` };
  }

  // 2. Stop active player & release selection (covers change during playback)
  usePlayerStore.getState().clearSelection();

  // 3. Cancel idle timers
  IdleTimerService.stop();

  // 4. Update root & persist in app data
  let updatedConfig: AppConfig;
  try {
    updatedConfig = await useSettingsStore.getState().setMediaRoot(validatedPath);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to persist media folder: ${errorMsg}` };
  }

  // 5. Move state machine to SCANNING_MEDIA (valid from GALLERY, INDIVIDUAL_PLAYER, SLIDESHOW, ADMIN_PANEL, ERROR)
  useApplicationStore.getState().dispatch('SCAN_START');

  // 6. Rescan folder and rebuild collection
  try {
    await performMediaScan(updatedConfig.cards_per_page);
    const endState = useApplicationStore.getState().state;
    if (endState === 'ERROR') {
      const reason = useApplicationStore.getState().errorReason || 'Media scan failed';
      return { success: false, error: reason };
    }
    // performMediaScan dispatches SCAN_OK on success, transitioning state to GALLERY
    return { success: true, config: updatedConfig };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    useApplicationStore.getState().dispatch('FATAL_ERROR', { errorReason: errorMsg });
    return { success: false, error: errorMsg };
  }
}
