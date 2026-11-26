import React, { useEffect } from 'react';
import { Stage } from '../components/Stage';
import { bridge } from '../services/bridge';
import '../styles/global.css';
import styles from './App.module.css';

export const App: React.FC = () => {
  useEffect(() => {
    // 1. Disable default context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // 2. Comprehensive kiosk key guard against browser accelerators & zoom
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape must NOT exit or close kiosk app
      if (e.key === 'Escape') {
        e.preventDefault();
        return;
      }

      // Exit kiosk app: Ctrl+Alt+Q
      if (e.ctrlKey && e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        bridge.exitApp();
        return;
      }

      // Open Admin: Ctrl+Alt+S
      if (e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        bridge.requestAdmin();
        return;
      }

      // Block browser accelerators: F5 (refresh), F11 (fullscreen toggle), F12 (devtools)
      if (['F5', 'F11', 'F12'].includes(e.key)) {
        e.preventDefault();
        return;
      }

      // Block Ctrl shortcuts: Ctrl+R (reload), Ctrl+P (print), Ctrl+U (source),
      // Ctrl+F (find), Ctrl+S (save), Ctrl+W (close tab)
      if (e.ctrlKey && ['r', 'R', 'p', 'P', 'u', 'U', 'f', 'F', 's', 'S', 'w', 'W'].includes(e.key)) {
        e.preventDefault();
        return;
      }

      // Block zoom: Ctrl+plus, Ctrl+minus, Ctrl+0
      if (e.ctrlKey && ['+', '-', '=', '0'].includes(e.key)) {
        e.preventDefault();
      }
    };

    // Block Ctrl+wheel zoom
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });

    // Listen for admin requested roundtrip
    const unlistenAdmin = bridge.onAdminRequested(() => {
      bridge.logClientMessage('INFO', 'Admin panel requested via bridge shortcut');
    });

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
      unlistenAdmin.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return (
    <Stage>
      <div className={styles.appContainer}>
        <h1 className={styles.appTitle}>
          KIOSK VIDEO PLAYER
        </h1>
        <p className={styles.appSubtitle}>
          1920x1080 Fixed Canvas Scaled Stage Active
        </p>
      </div>
    </Stage>
  );
};

export default App;
