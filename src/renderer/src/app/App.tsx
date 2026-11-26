import React, { useCallback, useEffect } from 'react';
import { Stage } from '../components/Stage';
import { bridge } from '../services/bridge';
import { useApplicationStore } from '../stores/applicationStore';
import { useMediaStore } from '../stores/mediaStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { GalleryScreen } from '../screens/GalleryScreen';
import { LoadingScreen } from '../screens/LoadingScreen';
import { ErrorScreen } from '../screens/ErrorScreen';
import { EmptyScreen } from '../screens/EmptyScreen';
import '../styles/global.css';
import styles from './App.module.css';

export const App: React.FC = () => {
  const appState = useApplicationStore((s) => s.state);
  const errorReason = useApplicationStore((s) => s.errorReason);
  const dispatch = useApplicationStore((s) => s.dispatch);
  const items = useMediaStore((s) => s.items);
  const mediaRoot = useMediaStore((s) => s.root);
  const videoCount = useMediaStore((s) => s.videoCount);
  const imageCount = useMediaStore((s) => s.imageCount);
  const configRoot = useSettingsStore((s) => s.config.kiosk_media_root);

  const performScan = useCallback(async (cardsPerPage?: number) => {
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
  }, []);

  const handleRetryScan = useCallback(async () => {
    const curState = useApplicationStore.getState().state;
    useApplicationStore.getState().dispatch(curState === 'ERROR' ? 'RETRY' : 'SCAN_START');
    await performScan();
  }, [performScan]);

  const handleSelectFolder = useCallback(async () => {
    try {
      const picked = await bridge.pickMediaFolder();
      if (!picked) return;
      const updated = await useSettingsStore.getState().setMediaRoot(picked);
      useApplicationStore.getState().dispatch('SCAN_START');
      await performScan(updated.cards_per_page);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useApplicationStore.getState().dispatch('FATAL_ERROR', { errorReason: msg });
    }
  }, [performScan]);

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
        await performScan(cfg?.cards_per_page ?? 8);
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        useApplicationStore.getState().dispatch('FATAL_ERROR', { errorReason: msg });
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
  }, [performScan]);

  const renderScreen = () => {
    switch (appState) {
      case 'INITIALIZING':
      case 'SCANNING_MEDIA':
        return (
          <LoadingScreen
            message={
              appState === 'INITIALIZING'
                ? 'Initializing Kiosk...'
                : 'Scanning Media Library...'
            }
          />
        );
      case 'ERROR':
        return (
          <ErrorScreen
            errorReason={errorReason ?? 'Failed to access media folder'}
            mediaRoot={mediaRoot || configRoot}
            onSelectFolder={handleSelectFolder}
            onRetry={handleRetryScan}
          />
        );
      case 'ADMIN_PANEL':
        return (
          <div className={styles.appContainer}>
            <h1 className={styles.appTitle}>ADMIN PANEL (PLACEHOLDER)</h1>
            <p className={styles.appSubtitle}>Full Admin UI arrives in Phase 6</p>
            <button type="button" onClick={() => dispatch('ADMIN_CLOSE')}>
              Close
            </button>
          </div>
        );
      case 'GALLERY':
      default:
        if (items.length === 0) {
          return (
            <EmptyScreen
              root={mediaRoot || configRoot}
              videoCount={videoCount}
              imageCount={imageCount}
              onSelectFolder={handleSelectFolder}
              onRetry={handleRetryScan}
            />
          );
        }
        return <GalleryScreen />;
    }
  };

  return <Stage>{renderScreen()}</Stage>;
};

export default App;
