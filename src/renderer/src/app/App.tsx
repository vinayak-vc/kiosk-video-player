import React, { useEffect } from 'react';
import { Stage } from '../components/Stage';
import { bridge } from '../services/bridge';
import { useApplicationStore } from '../stores/applicationStore';
import { useMediaStore } from '../stores/mediaStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import '../styles/global.css';
import styles from './App.module.css';

export const App: React.FC = () => {
  const appState = useApplicationStore((s) => s.state);
  const errorReason = useApplicationStore((s) => s.errorReason);
  const dispatch = useApplicationStore((s) => s.dispatch);
  const mediaCount = useMediaStore((s) => s.items.length);

  // 1. Kiosk key guard, contextmenu, wheel zoom, and admin shortcut subscription
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        return;
      }

      if (e.ctrlKey && e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        bridge.exitApp();
        return;
      }

      if (e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        bridge.requestAdmin();
        return;
      }

      if (['F5', 'F11', 'F12'].includes(e.key)) {
        e.preventDefault();
        return;
      }

      if (e.ctrlKey && ['r', 'R', 'p', 'P', 'u', 'U', 'f', 'F', 's', 'S', 'w', 'W'].includes(e.key)) {
        e.preventDefault();
        return;
      }

      if (e.ctrlKey && ['+', '-', '=', '0'].includes(e.key)) {
        e.preventDefault();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });

    const unlistenAdmin = bridge.onAdminRequested(() => {
      bridge.logClientMessage('INFO', 'Admin panel requested via bridge shortcut');
      useApplicationStore.getState().dispatch('ADMIN_OPEN');
    });

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
      unlistenAdmin.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // 2. Startup flow + media-changed subscription
  useEffect(() => {
    let mounted = true;

    const runStartup = async () => {
      try {
        const cfg = await useSettingsStore.getState().loadConfig();
        if (!mounted) return;
        useApplicationStore.getState().dispatch('INIT_DONE');

        const perPage = cfg?.cards_per_page ?? 8;
        const scan = await useMediaStore.getState().refresh(perPage);
        if (!mounted) return;

        if (scan && scan.errors.length > 0 && scan.items.length === 0) {
          useApplicationStore
            .getState()
            .dispatch('SCAN_FAIL', { errorReason: scan.errors[0] });
        } else {
          useApplicationStore.getState().dispatch('SCAN_OK');
        }
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        const appStore = useApplicationStore.getState();
        if (appStore.state === 'INITIALIZING') {
          appStore.dispatch('FATAL_ERROR', { errorReason: msg });
        } else if (appStore.state === 'SCANNING_MEDIA') {
          appStore.dispatch('SCAN_FAIL', { errorReason: msg });
        }
      }
    };

    runStartup();

    const unlistenMedia = bridge.onMediaChanged(() => {
      const cardsPerPage = useSettingsStore.getState().config.cards_per_page;
      useMediaStore
        .getState()
        .refresh(cardsPerPage)
        .then((scan) => {
          const activeId = usePlayerStore.getState().selectedMediaId;
          if (activeId && scan && !scan.items.some((item) => item.id === activeId)) {
            bridge.logClientMessage('WARN', `Active media '${activeId}' was removed on disk`);
          }
        })
        .catch(() => {});
    });

    return () => {
      mounted = false;
      unlistenMedia.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return (
    <Stage>
      <div className={styles.appContainer}>
        {appState === 'ADMIN_PANEL' ? (
          <div>
            <h1 className={styles.appTitle}>ADMIN PANEL (PLACEHOLDER)</h1>
            <p className={styles.appSubtitle}>Full Admin UI arrives in Phase 6</p>
            <button type="button" onClick={() => dispatch('ADMIN_CLOSE')}>
              Close
            </button>
          </div>
        ) : (
          <>
            <h1 className={styles.appTitle}>KIOSK VIDEO PLAYER</h1>
            <p className={styles.appSubtitle}>
              State: {appState} | Media: {mediaCount}
              {errorReason ? ` | Error: ${errorReason}` : ''}
            </p>
          </>
        )}
      </div>
    </Stage>
  );
};

export default App;
