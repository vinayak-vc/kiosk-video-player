import { bridge } from './bridge';
import { useApplicationStore } from '../stores/applicationStore';
import { useMediaStore } from '../stores/mediaStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';

export async function performMediaScan(cardsPerPage?: number): Promise<void> {
  try {
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
    const cfg = await useSettingsStore.getState().loadConfig();
    if (!isMounted()) return;
    useApplicationStore.getState().dispatch('INIT_DONE');
    await performMediaScan(cfg?.cards_per_page ?? 8);
  } catch (err) {
    if (!isMounted()) return;
    const msg = err instanceof Error ? err.message : String(err);
    useApplicationStore.getState().dispatch('FATAL_ERROR', { errorReason: msg });
  }
}

export async function handleMediaChangedEvent(): Promise<void> {
  const cardsPerPage = useSettingsStore.getState().config.cards_per_page;
  const scan = await useMediaStore.getState().refresh(cardsPerPage);
  const activeId = usePlayerStore.getState().selectedMediaId;
  if (activeId && scan && !scan.items.some((item) => item.id === activeId)) {
    void bridge.logClientMessage('WARN', `Active media '${activeId}' was removed on disk`).catch(() => {});
  }
}
