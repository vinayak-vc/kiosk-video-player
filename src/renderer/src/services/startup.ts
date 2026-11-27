import { bridge } from './bridge';
import { useApplicationStore } from '../stores/applicationStore';
import { useMediaStore } from '../stores/mediaStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';

export async function performMediaScan(cardsPerPage?: number): Promise<void> {
  try {
    if (
      bridge.platform === 'android' &&
      typeof bridge.checkStoragePermission === 'function'
    ) {
      const granted = await bridge.checkStoragePermission();
      if (!granted) {
        useApplicationStore.getState().setStoragePermissionDenied(true);
        useApplicationStore.getState().dispatch('SCAN_OK');
        return;
      }
      useApplicationStore.getState().setStoragePermissionDenied(false);
    }

    const perPage = cardsPerPage ?? useSettingsStore.getState().config.cards_per_page;
    const scan = await useMediaStore.getState().refresh(perPage);
    if (scan && scan.errors.length > 0 && scan.items.length === 0) {
      useApplicationStore
        .getState()
        .dispatch('SCAN_FAIL', { errorReason: scan.errors[0] });
    } else {
      useApplicationStore.getState().dispatch('SCAN_OK');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    useApplicationStore.getState().dispatch('SCAN_FAIL', { errorReason: msg });
  }
}

export async function executeStartup(isMounted: () => boolean = () => true): Promise<void> {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Test';
    const chromeVer = ua.match(/(?:Chrome|Chromium)\/([0-9.]+)/i)?.[0] || 'Chrome/Unknown';
    if (typeof bridge.logClientMessage === 'function') {
      bridge.logClientMessage('INFO', `Startup: Engine=${chromeVer} Platform=${bridge.platform} UA=${ua}`);
    }
    if (typeof bridge.initPlatform === 'function') {
      await bridge.initPlatform();
    }
    if (!isMounted()) return;
    const cfg = await useSettingsStore.getState().loadConfig();
    if (!isMounted()) return;

    if (
      bridge.platform === 'android' &&
      typeof bridge.checkStoragePermission === 'function'
    ) {
      const granted = await bridge.checkStoragePermission();
      if (!isMounted()) return;
      if (!granted) {
        useApplicationStore.getState().setStoragePermissionDenied(true);
        useApplicationStore.getState().dispatch('INIT_DONE');
        useApplicationStore.getState().dispatch('SCAN_OK');
        return;
      }
      useApplicationStore.getState().setStoragePermissionDenied(false);
    }

    useApplicationStore.getState().dispatch('INIT_DONE');
    await performMediaScan(cfg?.cards_per_page ?? 12);
  } catch (err) {
    if (!isMounted()) return;
    const msg = err instanceof Error ? err.message : String(err);
    useApplicationStore.getState().dispatch('FATAL_ERROR', { errorReason: msg });
  }
}

export async function handleMediaChangedEvent(): Promise<void> {
  const cardsPerPage = useSettingsStore.getState().config.cards_per_page;
  try {
    const scan = await useMediaStore.getState().refresh(cardsPerPage);
    const activeId = usePlayerStore.getState().selectedMediaId;
    const curState = useApplicationStore.getState().state;

    // If active video was deleted or whole folder was wiped/unplugged during playback
    if (curState === 'INDIVIDUAL_PLAYER' && activeId) {
      const stillExists = scan && scan.items.some((item) => item.id === activeId);
      if (!stillExists) {
        void bridge
          .logClientMessage('WARN', `Active media '${activeId}' was removed on disk during playback`)
          .catch(() => {});
        usePlayerStore.getState().clearSelection();
        useApplicationStore.getState().dispatch('PLAYER_EXIT');
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void bridge
      .logClientMessage('ERROR', `Media refresh failed on folder change: ${msg}`)
      .catch(() => {});
    const curState = useApplicationStore.getState().state;
    if (curState === 'INDIVIDUAL_PLAYER') {
      usePlayerStore.getState().clearSelection();
      useApplicationStore.getState().dispatch('PLAYER_EXIT');
    }
  }
}
