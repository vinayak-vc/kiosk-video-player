import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Film, FolderOpen, FolderX, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { createAnimationPresets } from '../services/AnimationService';
import { AudioService } from '../services/AudioService';
import styles from './StateScreens.module.css';

export type EmptyStateVariant =
  | 'NO_FOLDER'
  | 'EMPTY_FOLDER'
  | 'ONLY_VIDEOS'
  | 'ONLY_IMAGES'
  | 'NO_VALID_PAIRS';

export interface EmptyStateInput {
  root: string;
  videoCount: number;
  imageCount: number;
}

export function classifyEmptyState(input: EmptyStateInput): EmptyStateVariant {
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
  NO_FOLDER: {
    title: 'No Media Folder Configured',
    description: 'Select a folder containing matching .mp4 videos and .png/.jpg/.jpeg thumbnails.',
  },
  EMPTY_FOLDER: {
    title: 'Media Folder Is Empty',
    description: 'Add matching <name>.mp4 and <name>.png (or .jpg/.jpeg) pairs to the root of this folder.',
  },
  ONLY_VIDEOS: {
    title: 'Thumbnails Missing',
    description: 'MP4 videos were found, but each video requires a matching .png, .jpg, or .jpeg thumbnail with the same filename.',
  },
  ONLY_IMAGES: {
    title: 'Videos Missing',
    description: 'Images were found, but each thumbnail requires a matching .mp4 video with the same filename.',
  },
  NO_VALID_PAIRS: {
    title: 'No Matching Video Pairs',
    description: 'Videos and images exist in this folder, but none share the same filename.',
  },
};

export interface EmptyScreenProps {
  root: string;
  videoCount: number;
  imageCount: number;
  onSelectFolder: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
}

export const EmptyScreen: React.FC<EmptyScreenProps> = ({
  root,
  videoCount,
  imageCount,
  onSelectFolder,
  onRetry,
}) => {
  const [busy, setBusy] = useState(false);
  const reducedMotion = Boolean(useReducedMotion());
  const presets = useMemo(() => createAnimationPresets(reducedMotion), [reducedMotion]);

  const variant = classifyEmptyState({ root, videoCount, imageCount });
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

  const handleSelect = async () => {
    if (busy) return;
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
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSelect}
            disabled={busy}
          >
            <FolderOpen size={22} />
            Select another folder
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleRetry}
            disabled={busy}
          >
            <RefreshCw size={20} />
            Retry
          </button>
        </div>
      </div>
    </motion.section>
  );
};
