import React, { useCallback, useRef } from 'react';
import { bridge } from '../services/bridge';
import { AudioService } from '../services/AudioService';
import { useApplicationStore } from '../stores/applicationStore';
import styles from './AdminHotspot.module.css';

export const ADMIN_HOTSPOT_HOLD_MS = 2000;

export const AdminHotspot: React.FC = () => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useApplicationStore((s) => s.state);
  const dispatch = useApplicationStore((s) => s.dispatch);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.isPrimary === false) return;
      clearTimer();

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void AudioService.resumeOnGesture();
        AudioService.play('select');
        void bridge.logClientMessage('INFO', 'Admin panel requested via 2s long-press hotspot');
        dispatch('ADMIN_OPEN');
      }, ADMIN_HOTSPOT_HOLD_MS);
    },
    [clearTimer, dispatch]
  );

  // Hidden hotspot is disabled when already in ADMIN_PANEL
  if (appState === 'ADMIN_PANEL') {
    return null;
  }

  return (
    <div
      data-testid="admin-hotspot"
      className={styles.hotspot}
      onPointerDown={handlePointerDown}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      aria-label="Admin hidden access"
      role="button"
      tabIndex={-1}
    />
  );
};
