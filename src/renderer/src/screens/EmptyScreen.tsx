import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Film, FolderOpen, FolderX, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { useAnimationPresets } from '../hooks/useAnimationPresets';
import { AudioService } from '../services/AudioService';
import { STRINGS } from '../strings';
import styles from './StateScreens.module.css';

export type EmptyStateVariant =
  | 'NO_PERMISSION'
  | 'NO_FOLDER'
  | 'EMPTY_FOLDER'
  | 'ONLY_VIDEOS'
  | 'ONLY_IMAGES'
  | 'NO_VALID_PAIRS';

export interface EmptyStateInput {
  root: string;
  videoCount: number;
  imageCount: number;
  permissionDenied?: boolean;
}

export function classifyEmptyState(input: EmptyStateInput): EmptyStateVariant {
  if (input.permissionDenied) {
    return 'NO_PERMISSION';
  }
  if (!input.root || input.root.trim() === '') {
    return 'NO_FOLDER';
  }
  if (input.videoCount > 0 && input.imageCount === 0) {
    return 'ONLY_VIDEOS';
  }
  if (input.videoCount === 0 && input.imageCount > 0) {
    return 'ONLY_IMAGES';
  }
  if (input.videoCount > 0 && input.imageCount > 0) {
    return 'NO_VALID_PAIRS';
  }
  return 'EMPTY_FOLDER';
}

const EMPTY_COPY: Record<
  EmptyStateVariant,
  { title: string; description: string }
> = {
  NO_PERMISSION: STRINGS.empty.NO_PERMISSION,
  NO_FOLDER: STRINGS.empty.NO_FOLDER,
  EMPTY_FOLDER: STRINGS.empty.EMPTY_FOLDER,
  ONLY_VIDEOS: STRINGS.empty.ONLY_VIDEOS,
  ONLY_IMAGES: STRINGS.empty.ONLY_IMAGES,
  NO_VALID_PAIRS: STRINGS.empty.NO_VALID_PAIRS,
};

export interface EmptyScreenProps {
  root: string;
  videoCount: number;
  imageCount: number;
  permissionDenied?: boolean;
  onGrantPermission?: () => Promise<void> | void;
  onSelectFolder?: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
}

export const EmptyScreen: React.FC<EmptyScreenProps> = ({
  root,
  videoCount,
  imageCount,
  permissionDenied,
  onGrantPermission,
  onSelectFolder,
  onRetry,
}) => {
  const [busy, setBusy] = useState(false);
  const presets = useAnimationPresets();

  const variant = classifyEmptyState({ root, videoCount, imageCount, permissionDenied });
  const copy = EMPTY_COPY[variant];

  const renderIcon = () => {
    switch (variant) {
      case 'ONLY_VIDEOS':
        return <Film size={44} />;
      case 'ONLY_IMAGES':
        return <ImageIcon size={44} />;
      default:
        return <FolderX size={44} />;
    }
  };

  const handleGrant = async () => {
    if (busy || !onGrantPermission) return;
    AudioService.play('tap');
    setBusy(true);
    try {
      await onGrantPermission();
    } finally {
      setBusy(false);
    }
  };

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
      data-testid="empty-screen"
      data-empty-variant={variant}
    >
      <div className={styles.cardBox}>
        <div className={styles.iconRing}>{renderIcon()}</div>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.description}>{copy.description}</p>
        {root && <div className={styles.pathChip}>{root}</div>}

        <div className={styles.actionsRow}>
          {variant === 'NO_PERMISSION' && onGrantPermission ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleGrant}
              disabled={busy}
            >
              <FolderOpen size={22} />
              {STRINGS.empty.grantButton}
            </button>
          ) : (
            onSelectFolder && (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSelect}
                disabled={busy}
              >
                <FolderOpen size={22} />
                {STRINGS.empty.selectFolderButton}
              </button>
            )
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleRetry}
            disabled={busy}
          >
            <RefreshCw size={20} />
            {STRINGS.empty.retryButton}
          </button>
        </div>
      </div>
    </motion.section>
  );
};
