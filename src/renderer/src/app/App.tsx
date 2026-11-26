import React, { useCallback, useEffect } from 'react';
import { LayoutGroup } from 'framer-motion';
import { Stage } from '../components/Stage';
import { bridge } from '../services/bridge';
import { IdleTimerService } from '../services/IdleTimerService';
import { executeStartup, handleMediaChangedEvent, performMediaScan } from '../services/startup';
import { executeFolderChangeFlow } from '../services/folderChange';
import { useApplicationStore } from '../stores/applicationStore';
import { useMediaStore } from '../stores/mediaStore';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { GalleryScreen } from '../screens/GalleryScreen';
import { LoadingScreen } from '../screens/LoadingScreen';
import { ErrorScreen } from '../screens/ErrorScreen';
import { EmptyScreen } from '../screens/EmptyScreen';
import { SlideshowScreen } from '../screens/SlideshowScreen';
import { AdminPanelScreen } from '../screens/AdminPanelScreen';
import { AdminHotspot } from '../components/AdminHotspot';
import { VideoPlayer } from '../components/VideoPlayer';
import '../styles/global.css';

export const App: React.FC = () => {
  const appState = useApplicationStore((s) => s.state);
  const errorReason = useApplicationStore((s) => s.errorReason);
  const storagePermissionDenied = useApplicationStore((s) => s.storagePermissionDenied);
  const items = useMediaStore((s) => s.items);
  const screensaver = useMediaStore((s) => s.screensaver);
  const selectedMediaId = usePlayerStore((s) => s.selectedMediaId);
  const isPlayerPlaying = usePlayerStore((s) => s.isPlaying);
  const mediaRoot = useMediaStore((s) => s.root);
  const videoCount = useMediaStore((s) => s.videoCount);
  const imageCount = useMediaStore((s) => s.imageCount);
  const configRoot = useSettingsStore((s) => s.config.kiosk_media_root);
  const idleTimeoutSeconds = useSettingsStore((s) => s.config.idle_timeout_seconds);

  const handleRetryScan = useCallback(async () => {
    const curState = useApplicationStore.getState().state;
    useApplicationStore.getState().dispatch(curState === 'ERROR' ? 'RETRY' : 'SCAN_START');
    await performMediaScan();
  }, []);

  const handleGrantPermission = useCallback(async () => {
    await bridge.requestStoragePermission();
  }, []);

  const handleSelectFolder = useCallback(async () => {
    try {
      const picked = await bridge.pickMediaFolder();
      if (!picked) return;
      await executeFolderChangeFlow(picked);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useApplicationStore.getState().dispatch('FATAL_ERROR', { errorReason: msg });
    }
  }, []);

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
    void executeStartup(() => mounted);

    const unlistenMedia = bridge.onMediaChanged(() => {
      void handleMediaChangedEvent().catch(() => {});
    });

    const handleResumePermissionCheck = () => {
      if (
        bridge.platform !== 'android' ||
        !useApplicationStore.getState().storagePermissionDenied ||
        typeof bridge.checkStoragePermission !== 'function'
      ) {
        return;
      }
      void bridge
        .checkStoragePermission()
        .then((granted) => {
          if (granted && mounted) {
            useApplicationStore.getState().setStoragePermissionDenied(false);
            useApplicationStore.getState().dispatch('SCAN_START');
            return performMediaScan();
          }
          return undefined;
        })
        .catch(() => {});
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleResumePermissionCheck();
      }
    };

    window.addEventListener('focus', handleResumePermissionCheck);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleResumePermissionCheck);
      document.removeEventListener('visibilitychange', handleVisibility);
      unlistenMedia.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // 3. Centralized IdleTimerService lifecycle tied to state machine & playback
  useEffect(() => {
    const canRunSlideshow = items.length > 0 || Boolean(screensaver);
    const shouldArm =
      canRunSlideshow &&
      (appState === 'GALLERY' || (appState === 'INDIVIDUAL_PLAYER' && !isPlayerPlaying));

    if (!shouldArm) {
      IdleTimerService.stop();
      return () => {
        IdleTimerService.stop();
      };
    }

    IdleTimerService.start(idleTimeoutSeconds, () => {
      if (useApplicationStore.getState().state === 'INDIVIDUAL_PLAYER') {
        usePlayerStore.getState().clearSelection();
      }
      useApplicationStore.getState().dispatch('IDLE_TIMEOUT', { lockDurationMs: 450 });
    });

    const resetOnActivity = () => {
      IdleTimerService.reset();
    };

    window.addEventListener('pointerdown', resetOnActivity, true);
    window.addEventListener('keydown', resetOnActivity, true);

    return () => {
      window.removeEventListener('pointerdown', resetOnActivity, true);
      window.removeEventListener('keydown', resetOnActivity, true);
      IdleTimerService.stop();
    };
  }, [appState, isPlayerPlaying, idleTimeoutSeconds, items.length, screensaver]);

  const selectFolderHandler =
    bridge.platform === 'android' ? undefined : handleSelectFolder;

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
            onSelectFolder={selectFolderHandler}
            onRetry={handleRetryScan}
          />
        );
      case 'ADMIN_PANEL':
        return <AdminPanelScreen />;
      case 'INDIVIDUAL_PLAYER': {
        const selectedItem = items.find((item) => item.id === selectedMediaId);
        if (!selectedItem) {
          return (
            <ErrorScreen
              errorReason="Selected video is no longer available"
              mediaRoot={mediaRoot || configRoot}
              onSelectFolder={selectFolderHandler}
              onRetry={() => {
                usePlayerStore.getState().clearSelection();
                useApplicationStore.getState().dispatch('PLAYER_EXIT');
              }}
            />
          );
        }
        return <VideoPlayer item={selectedItem} />;
      }
      case 'SLIDESHOW':
        return <SlideshowScreen />;
      case 'GALLERY':
      default:
        if (items.length === 0) {
          return (
            <EmptyScreen
              root={mediaRoot || configRoot}
              videoCount={videoCount}
              imageCount={imageCount}
              permissionDenied={storagePermissionDenied}
              onGrantPermission={handleGrantPermission}
              onSelectFolder={selectFolderHandler}
              onRetry={handleRetryScan}
            />
          );
        }
        return <GalleryScreen />;
    }
  };

  return (
    <Stage>
      <AdminHotspot />
      <LayoutGroup>{renderScreen()}</LayoutGroup>
    </Stage>
  );
};

export default App;
