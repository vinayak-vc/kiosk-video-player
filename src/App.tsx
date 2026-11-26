import React, { useEffect } from 'react';
import { Stage } from './renderer/src/components/Stage';
import { bridge } from './renderer/src/services/bridge';
import './renderer/src/styles/global.css';

export const App: React.FC = () => {
  useEffect(() => {
    // Disable default browser context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Keyboard shortcuts: Ctrl+Alt+Q to exit, Ctrl+Alt+S for admin, suppress Escape closing
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
      }
      if (e.ctrlKey && e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        bridge.exitApp();
      }
      if (e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        console.log('Admin shortcut triggered');
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <Stage>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
        }}
      >
        <h1
          style={{
            fontSize: '54px',
            fontWeight: 800,
            letterSpacing: '2px',
            background: 'linear-gradient(135deg, #00f0ff 0%, #0080ff 50%, #7928ca 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 30px rgba(0, 240, 255, 0.4)',
          }}
        >
          KIOSK VIDEO PLAYER
        </h1>
        <p
          style={{
            fontSize: '20px',
            color: 'var(--text-secondary)',
            letterSpacing: '1px',
          }}
        >
          1920x1080 Fixed Canvas Scaled Stage Active
        </p>
      </div>
    </Stage>
  );
};

export default App;
