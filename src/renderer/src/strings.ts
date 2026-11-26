/**
 * Centralised user-visible UI strings for Kiosk Video Player.
 * Source of truth: Docs/ui_strings_comparison_75_expo_edition.md (Bold & Modern 75" Expo).
 */

export const STRINGS = {
  app: {
    name: 'Kiosk Video Player',
  },

  gallery: {
    heading: {
      prefix: 'Built to',
      highlight: 'Inspire',
    },
    prevPageLabel: 'Previous page',
    nextPageLabel: 'Next page',
  },

  loading: {
    message: 'Loading Media...',
  },

  empty: {
    NO_PERMISSION: {
      title: 'Storage Access Needed',
      description:
        'Allow all-files access so the player can load local videos and thumbnails.',
    },
    NO_FOLDER: {
      title: 'No Media Folder Set',
      description:
        'Choose a folder with matching .mp4 videos and .png/.jpg/.jpeg thumbnails.',
    },
    EMPTY_FOLDER: {
      title: 'Media Folder Empty',
      description:
        'Add matching <name>.mp4 and <name>.png/.jpg/.jpeg files to the folder root.',
    },
    ONLY_VIDEOS: {
      title: 'Thumbnails Missing',
      description:
        'Add a matching .png, .jpg, or .jpeg thumbnail for each .mp4 file.',
    },
    ONLY_IMAGES: {
      title: 'Videos Missing',
      description:
        'Add a matching .mp4 video for each thumbnail image.',
    },
    NO_VALID_PAIRS: {
      title: 'No Matching Pairs',
      description:
        'Rename matching video and thumbnail files so they share the exact same name.',
    },
    grantButton: 'Grant Access',
    selectFolderButton: 'Select Folder',
    retryButton: 'Retry',
  },

  error: {
    title: 'Media Unavailable',
    defaultReason: 'Unable to access media folder',
    playerMissing: 'Video no longer available',
    selectFolderButton: 'Select Folder',
    retryButton: 'Retry',
  },

  player: {
    back: 'Back',
    backToGallery: 'Back to Gallery',
    backToGalleryLabel: 'Back to gallery',
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
    loadWatchdogError: 'Took over 10s to load',
    stallError: 'Playback stalled',
    unableToPlay: (code: number) => `Playback error (code ${code})`,
  },

  admin: {
    title: 'SYSTEM & KIOSK CONTROLS',
    subtitle: 'Media folder setup, library health, and playback diagnostics.',
    returnToGallery: 'Back to Gallery',
    closeAriaLabel: 'Close Admin Panel',

    sections: {
      mediaRoot: 'Media Root Directory',
      integrity: 'Library Health & Counts',
      testPlayback: 'Playback Test',
      deviceInfo: 'Device & Kiosk Config',
      diagnostics: 'Hardware & Playback Diagnostics',
    },

    actions: {
      validate: 'Validate',
      applyAndRescan: 'Apply & Rescan',
      browse: 'Browse Folder',
      forceRescan: 'Force Rescan',
      exitKiosk: 'Exit Kiosk',
      play: 'Play',
      stop: 'Stop',
      runDiagnostics: 'Run Diagnostics',
      runningDiagnostics: 'Running Diagnostics...',
      copyReport: 'Copy Report',
      copiedReport: 'Copied!',
    },

    androidFolderHint:
      'Place media in /storage/emulated/0/Kiosk/Media or set KIOSK_MEDIA_ROOT in kiosk.env',

    stats: {
      playablePairs: 'Playable Pairs',
      ignoredOrphans: 'Unmatched Files',
      totalVideos: 'Total Videos (.mp4)',
      totalImages: 'Total Images (PNG/JPG)',
      screensaverPresent: 'Screensaver.mp4 Ready (Idle loop active)',
      screensaverMissing: 'Screensaver.mp4 Missing (Shuffle slideshow active)',
      scanErrors: (count: number) => `Scan Errors (${count})`,
    },

    testPlayback: {
      screensaverLabel: 'Screensaver.mp4 (Idle Video)',
      noVideos: 'No videos available',
      hint: 'Select a clip and hit Play to test video & audio',
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
      title: 'Exit Kiosk Mode?',
      androidBody: 'Exit kiosk lock and return to the Android home screen?',
      desktopBody: 'Exit kiosk mode and return to the desktop?',
      cancel: 'Cancel',
      confirm: 'Exit Kiosk',
    },
  },
} as const;
