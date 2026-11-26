import React, { useEffect, useRef } from 'react';
import { bridge } from '../services/bridge';
import { AudioService } from '../services/AudioService';
import { useApplicationStore } from '../stores/applicationStore';
import styles from './AdminHotspot.module.css';

export const ADMIN_HOTSPOT_HOLD_MS = 2000;
export const HOTSPOT_AREA_PX = 120;

export const AdminHotspot: React.FC = () => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const appState = useApplicationStore((s) => s.state);
  const dispatch = useApplicationStore((s) => s.dispatch);

  useEffect(() => {
    // Hidden hotspot is disabled when already inside ADMIN_PANEL
    if (appState === 'ADMIN_PANEL') {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startPosRef.current = null;
    };

    const getStageCoords = (clientX: number, clientY: number) => {
      const stage = document.querySelector('[data-testid="stage-container"]');
      if (stage) {
        const rect = stage.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const scale = rect.width / 1920;
          return {
            x: (clientX - rect.left) / scale,
            y: (clientY - rect.top) / scale,
          };
        }
      }
      return { x: clientX, y: clientY };
    };

    const handleWindowPointerDown = (e: PointerEvent) => {
      if (e.isPrimary === false) return;
      clearTimer();

      const coords = getStageCoords(e.clientX, e.clientY);
      // Check top-left corner in stage space (0..120 px)
      if (
        coords.x >= 0 &&
        coords.x <= HOTSPOT_AREA_PX &&
        coords.y >= 0 &&
        coords.y <= HOTSPOT_AREA_PX
      ) {
        startPosRef.current = { x: e.clientX, y: e.clientY };
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          startPosRef.current = null;
          void AudioService.resumeOnGesture();
          AudioService.play('select');
          void bridge.logClientMessage('INFO', 'Admin panel requested via 2s long-press hotspot');
          dispatch('ADMIN_OPEN');
        }, ADMIN_HOTSPOT_HOLD_MS);
      }
    };

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!timerRef.current || !startPosRef.current) return;
      const dist = Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y);
      const coords = getStageCoords(e.clientX, e.clientY);
      if (
        dist > 25 ||
        coords.x < 0 ||
        coords.x > HOTSPOT_AREA_PX ||
        coords.y < 0 ||
        coords.y > HOTSPOT_AREA_PX
      ) {
        clearTimer();
      }
    };

    const handleWindowPointerUp = () => {
      clearTimer();
    };

    const handleWindowPointerCancel = () => {
      clearTimer();
    };

    // Window capture listeners: observes events without swallowing them or stopping propagation
    window.addEventListener('pointerdown', handleWindowPointerDown, { capture: true });
    window.addEventListener('pointermove', handleWindowPointerMove, { capture: true });
    window.addEventListener('pointerup', handleWindowPointerUp, { capture: true });
    window.addEventListener('pointercancel', handleWindowPointerCancel, { capture: true });

    return () => {
      clearTimer();
      window.removeEventListener('pointerdown', handleWindowPointerDown, { capture: true });
      window.removeEventListener('pointermove', handleWindowPointerMove, { capture: true });
      window.removeEventListener('pointerup', handleWindowPointerUp, { capture: true });
      window.removeEventListener('pointercancel', handleWindowPointerCancel, { capture: true });
    };
  }, [appState, dispatch]);

  if (appState === 'ADMIN_PANEL') {
    return null;
  }

  return (
    <div
      data-testid="admin-hotspot"
      className={styles.hotspot}
      aria-hidden="true"
      tabIndex={-1}
    />
  );
};
