import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, FolderOpen, RefreshCw } from 'lucide-react';
import { useAnimationPresets } from '../hooks/useAnimationPresets';
import { AudioService } from '../services/AudioService';
import { STRINGS } from '../strings';
import styles from './StateScreens.module.css';

export interface ErrorScreenProps {
  errorReason: string;
  mediaRoot?: string;
  onSelectFolder?: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
}

export const ErrorScreen: React.FC<ErrorScreenProps> = ({
  errorReason,
  mediaRoot,
  onSelectFolder,
  onRetry,
}) => {
  const [busy, setBusy] = useState(false);
  const presets = useAnimationPresets();

  const handleSelect = async () => {
    if (busy || !onSelectFolder) return;
    AudioService.play('tap');
    setBusy(true);
    try {
      await onSelectFolder();
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (busy) return;
    AudioService.play('tap');
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section
      className={styles.screenContainer}
      variants={presets.emptyStateEntrance}
      initial="hidden"
      animate="visible"
      data-testid="error-screen"
    >
      <div className={styles.cardBox}>
        <div className={`${styles.iconRing} ${styles.iconRingError}`}>
          <AlertTriangle size={44} />
        </div>
        <h1 className={styles.title}>{STRINGS.error.title}</h1>
        <p className={styles.description}>{errorReason || STRINGS.error.defaultReason}</p>
        {mediaRoot && <div className={styles.pathChip}>{mediaRoot}</div>}

        <div className={styles.actionsRow}>
          {onSelectFolder && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSelect}
              disabled={busy}
            >
              <FolderOpen size={22} />
              {STRINGS.error.selectFolderButton}
            </button>
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleRetry}
            disabled={busy}
          >
            <RefreshCw size={20} />
            {STRINGS.error.retryButton}
          </button>
        </div>
      </div>
    </motion.section>
  );
};
