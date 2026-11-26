/**
 * Centralised user-visible UI strings for Kiosk Video Player.
 * All on-screen copy is defined here to allow fast proofreading and single-file copy edits.
 * @see Docs/UI_TEXT_PROOFREAD.md
 */

export const STRINGS = {
  app: {
    name: 'Kiosk Video Player',
  },

  gallery: {
    heading: {
      prefix: 'Curated to',
      highlight: 'Inspire',
    },
    prevPageLabel: 'Previous page',
    nextPageLabel: 'Next page',
  },

  loading: {
    message: 'Preparing Media Library...',
  },

  empty: {
    NO_PERMISSION: {
      title: 'Storage Permission Required',
      description:
        'Grant all-files access so Kiosk Video Player can read videos and thumbnails from external storage.',
    },
    NO_FOLDER: {
      title: 'No Media Folder Configured',
      description:
        'Select a folder containing matching .mp4 videos and .png/.jpg/.jpeg thumbnails.',
    },
    EMPTY_FOLDER: {
      title: 'Media Folder Is Empty',
      description:
        'Add matching <name>.mp4 and <name>.png (or .jpg/.jpeg) pairs to the root of this folder.',
    },
    ONLY_VIDEOS: {
      title: 'Thumbnails Missing',
      description:
        'MP4 videos were found, but each video requires a matching .png, .jpg, or .jpeg thumbnail with the same filename.',
    },
    ONLY_IMAGES: {
      title: 'Videos Missing',
      description:
        'Images were found, but each thumbnail requires a matching .mp4 video with the same filename.',
    },
    NO_VALID_PAIRS: {
      title: 'No Matching Video Pairs',
      description:
        'Videos and images exist in this folder, but none share the same filename.',
    },
    grantButton: 'Grant file access',
    selectFolderButton: 'Select another folder',
    retryButton: 'Retry',
  },

  error: {
    title: 'Unable to Load Media',
    defaultReason: 'Failed to access media folder',
    playerMissing: 'Selected video is no longer available',
    selectFolderButton: 'Select another folder',
    retryButton: 'Retry',
  },

  player: {
    back: 'Back',
    backToGallery: 'Back to gallery',
    resumePlayback: 'Resume playback',
    seekTimeline: 'Seek timeline',
    pause: 'Pause',
    play: 'Play',
    unmute: 'Unmute',
    mute: 'Mute',
    volume: 'Volume',
    enterFullscreen: 'Enter fullscreen',
    exitFullscreen: 'Exit fullscreen',
    unknownDuration: '--:--',
    loadWatchdogError: 'Video failed to load within 10 seconds',
    stallError: 'Video playback stalled',
    unableToPlay: (code: number) => `Unable to play this video (code ${code})`,
  },

  admin: {
    title: 'ADMIN & SYSTEM DIAGNOSTICS',
    subtitle:
      'Kiosk configuration, library integrity metrics, folder management, and hardware test playback.',
    returnToGallery: 'Return to Gallery',
    closeAriaLabel: 'Close Admin Panel',

    sections: {
      mediaRoot: 'Media Root Directory',
      integrity: 'Library Integrity & File Counts',
      testPlayback: 'Test Video Playback',
      deviceInfo: 'Device & Configuration Info',
    },

    actions: {
      validate: 'Validate',
      applyAndRescan: 'Apply & Rescan',
      browse: 'Browse System Folder',
      forceRescan: 'Force Rescan',
      exitKiosk: 'Exit Kiosk Application',
      play: 'Play',
      stop: 'Stop',
    },

    androidFolderHint:
      'Copy files to /storage/emulated/0/Kiosk/Media or configure KIOSK_MEDIA_ROOT in kiosk.env',

    stats: {
      playablePairs: 'Playable Pairs',
      ignoredOrphans: 'Ignored Orphans',
      totalVideos: 'Total Videos (.mp4)',
      totalImages: 'Total Images (PNG/JPG)',
      screensaverPresent: 'Screensaver.mp4 Present (Idle loop ready)',
      screensaverMissing: 'Screensaver.mp4 Missing (Fallback: Shuffle Slideshow)',
      scanErrors: (count: number) => `Scan Errors (${count})`,
    },

    testPlayback: {
      screensaverLabel: 'Screensaver.mp4 (Idle Video)',
      noVideos: 'No videos available',
      hint: 'Select a video and tap Play to verify decode & sound',
    },

    configKeys: {
      platform: 'Platform',
      cardsPerPage: 'Cards Per Page',
      idleTimeout: 'Idle Timeout',
      controlsAutoHide: 'Controls Auto-Hide',
      slideshowMode: 'Slideshow Mode',
      screensaverSound: 'Screensaver Sound',
      sfxEnabled: 'Sound Effects (SFX)',
    },

    exitDialog: {
      title: 'Exit Kiosk Application?',
      androidBody:
        'Are you sure you want to exit Kiosk mode? This will stop kiosk lock and close the application to return to the Android launcher.',
      desktopBody:
        'Are you sure you want to exit Kiosk mode and return to the system desktop?',
      cancel: 'Cancel',
      confirm: 'Yes, Exit App',
    },
  },
} as const;
