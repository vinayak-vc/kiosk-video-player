import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Folder,
  RefreshCw,
  Play,
  Square,
  CheckCircle,
  AlertTriangle,
  X,
  LogOut,
  Database,
  Monitor,
} from 'lucide-react';
import { AudioService } from '../services/AudioService';
import { bridge } from '../services/bridge';
import { useAnimationPresets } from '../hooks/useAnimationPresets';
import { useApplicationStore } from '../stores/applicationStore';
import { useMediaStore } from '../stores/mediaStore';
import { useSettingsStore } from '../stores/settingsStore';
import { performMediaScan } from '../services/startup';
import { executeFolderChangeFlow } from '../services/folderChange';
import type { MediaItem } from '../types';
import styles from './AdminPanelScreen.module.css';

interface AdminPanelScreenProps {
  onClose?: () => void;
}

export const AdminPanelScreen: React.FC<AdminPanelScreenProps> = ({ onClose }) => {
  const items = useMediaStore((s) => s.items);
  const screensaver = useMediaStore((s) => s.screensaver);
  const orphanCount = useMediaStore((s) => s.ignoredOrphanCount);
  const videoCount = useMediaStore((s) => s.videoCount);
  const imageCount = useMediaStore((s) => s.imageCount);
  const scanErrors = useMediaStore((s) => s.scanErrors);
  const mediaRoot = useMediaStore((s) => s.root);
  const config = useSettingsStore((s) => s.config);
  const dispatch = useApplicationStore((s) => s.dispatch);
  const presets = useAnimationPresets();

  const [inputPath, setInputPath] = useState(mediaRoot || config.kiosk_media_root);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Test video playback state
  const [selectedTestId, setSelectedTestId] = useState<string>(items[0]?.id || (screensaver ? '__screensaver__' : ''));
  const [isTestPlaying, setIsTestPlaying] = useState(false);
  const testVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setInputPath(mediaRoot || config.kiosk_media_root);
  }, [mediaRoot, config.kiosk_media_root]);

  const handleClose = useCallback(() => {
    void AudioService.resumeOnGesture();
    AudioService.play('return');
    if (onClose) {
      onClose();
    } else {
      dispatch('ADMIN_CLOSE');
    }
  }, [onClose, dispatch]);

  const handlePickFolder = async () => {
    try {
      const picked = await bridge.pickMediaFolder();
      if (!picked) return;
      setInputPath(picked);
      await applyFolderChange(picked);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const applyFolderChange = async (targetPath: string) => {
    setIsRescanning(true);
    setFeedback(null);
    const result = await executeFolderChangeFlow(targetPath);
    setIsRescanning(false);
    if (result.success && result.config) {
      setFeedback({ type: 'success', message: `Media folder updated to: ${result.config.kiosk_media_root}` });
    } else {
      setFeedback({ type: 'error', message: result.error || 'Folder change failed' });
    }
  };

  const handleValidateOnly = async () => {
    try {
      const validated = await bridge.validateMediaFolder(inputPath);
      setFeedback({ type: 'success', message: `Path is valid: ${validated}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: 'error', message: `Invalid folder: ${msg}` });
    }
  };

  const handleApplyInputFolder = async () => {
    if (!inputPath.trim()) return;
    await applyFolderChange(inputPath.trim());
  };

  const handleForceRescan = async () => {
    setIsRescanning(true);
    setFeedback(null);
    try {
      await performMediaScan(config.cards_per_page);
      setFeedback({ type: 'success', message: 'Library rescan complete.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: 'error', message: `Rescan failed: ${msg}` });
    } finally {
      setIsRescanning(false);
    }
  };

  const handleStartTestPlay = () => {
    if (!selectedTestId) return;
    setIsTestPlaying(true);
  };

  const handleStopTestPlay = () => {
    if (testVideoRef.current) {
      try {
        testVideoRef.current.pause();
        testVideoRef.current.removeAttribute('src');
        testVideoRef.current.load();
      } catch {
        // Safe for jsdom/detached video element tests
      }
    }
    setIsTestPlaying(false);
  };

  const handleExitApp = () => {
    void bridge.logClientMessage('INFO', 'Application exit requested from Admin Panel');
    bridge.exitApp();
  };

  // Determine URL of currently selected test video
  let testVideoUrl = '';
  if (selectedTestId === '__screensaver__' && screensaver) {
    testVideoUrl = screensaver.video_url;
  } else {
    const item = items.find((i) => i.id === selectedTestId);
    if (item) {
      testVideoUrl = item.video_url;
    }
  }

  return (
    <motion.div
      data-testid="admin-panel-screen"
      className={styles.adminContainer}
      variants={presets.adminPanelEntrance}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1>ADMIN & SYSTEM DIAGNOSTICS</h1>
          <p>Kiosk configuration, library integrity metrics, folder management, and hardware test playback.</p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            data-testid="admin-close-button"
            aria-label="Close Admin Panel"
          >
            <X size={20} />
            <span>Return to Gallery</span>
          </button>
        </div>
      </header>

      <div className={styles.contentGrid}>
        {/* Left Column: Folder Management & Library Stats */}
        <div className={styles.column}>
          {/* Folder Management Card */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Folder size={22} />
              <span>Media Root Directory</span>
            </div>
            <div className={styles.folderRow}>
              <input
                type="text"
                className={styles.pathInput}
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="/path/to/media"
                data-testid="admin-folder-input"
              />
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleValidateOnly}
                data-testid="admin-validate-button"
              >
                Validate
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleApplyInputFolder}
                disabled={isRescanning}
                data-testid="admin-save-folder-button"
              >
                {isRescanning ? 'Scanning...' : 'Apply & Rescan'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handlePickFolder}
                data-testid="admin-pick-folder-button"
              >
                <Folder size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                Browse System Folder
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleForceRescan}
                disabled={isRescanning}
                data-testid="admin-rescan-button"
              >
                <RefreshCw size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                Force Rescan
              </button>
            </div>

            {feedback && (
              <div
                className={`${styles.folderFeedback} ${
                  feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
                }`}
                data-testid="admin-feedback"
              >
                {feedback.message}
              </div>
            )}
          </section>

          {/* Library Integrity & Metrics */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Database size={22} />
              <span>Library Integrity & File Counts</span>
            </div>
            <div className={styles.statsGrid}>
              <div className={styles.statTile}>
                <div className={styles.statLabel}>Playable Pairs</div>
                <div className={`${styles.statValue} ${styles.statValueCyan}`} data-testid="stat-pairs-count">
                  {items.length}
                </div>
              </div>
              <div className={styles.statTile}>
                <div className={styles.statLabel}>Ignored Orphans</div>
                <div
                  className={`${styles.statValue} ${orphanCount > 0 ? styles.statValueWarning : styles.statValueSuccess}`}
                  data-testid="stat-orphans-count"
                >
                  {orphanCount}
                </div>
              </div>
              <div className={styles.statTile}>
                <div className={styles.statLabel}>Total Videos (.mp4)</div>
                <div className={styles.statValue} data-testid="stat-videos-count">
                  {videoCount}
                </div>
              </div>
              <div className={styles.statTile}>
                <div className={styles.statLabel}>Total Images (PNG/JPG)</div>
                <div className={styles.statValue} data-testid="stat-images-count">
                  {imageCount}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              {screensaver ? (
                <>
                  <CheckCircle size={18} color="#34d399" />
                  <span style={{ color: '#34d399' }} data-testid="stat-screensaver-status">
                    Screensaver.mp4 Present (Idle loop ready)
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle size={18} color="#fbbf24" />
                  <span style={{ color: '#fbbf24' }} data-testid="stat-screensaver-status">
                    Screensaver.mp4 Missing (Fallback: Shuffle Slideshow)
                  </span>
                </>
              )}
            </div>

            {scanErrors && scanErrors.length > 0 && (
              <div className={styles.errorsBox} data-testid="admin-scan-errors">
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>Scan Errors ({scanErrors.length}):</div>
                {scanErrors.map((err, idx) => (
                  <div key={idx}>â€¢ {err}</div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Test Playback & Settings Overview */}
        <div className={styles.column}>
          {/* Test Video Playback */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Play size={22} />
              <span>Test Video Playback</span>
            </div>
            <div className={styles.testPlayerContainer}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <select
                  className={styles.selectClip}
                  value={selectedTestId}
                  onChange={(e) => {
                    setSelectedTestId(e.target.value);
                    if (isTestPlaying) handleStopTestPlay();
                  }}
                  data-testid="admin-test-clip-select"
                >
                  {screensaver && <option value="__screensaver__">Screensaver.mp4 (Idle Video)</option>}
                  {items.map((item: MediaItem) => (
                    <option key={item.id} value={item.id}>
                      {item.display_title} ({item.filename})
                    </option>
                  ))}
                  {items.length === 0 && !screensaver && (
                    <option value="" disabled>
                      No videos available
                    </option>
                  )}
                </select>

                {!isTestPlaying ? (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleStartTestPlay}
                    disabled={!selectedTestId}
                    data-testid="admin-test-play-button"
                  >
                    <Play size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                    Play
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={handleStopTestPlay}
                    data-testid="admin-test-stop-button"
                  >
                    <Square size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                    Stop
                  </button>
                )}
              </div>

              <div className={styles.testVideoWrapper}>
                {isTestPlaying && testVideoUrl ? (
                  <video
                    ref={testVideoRef}
                    data-testid="admin-test-video-player"
                    className={styles.testVideo}
                    src={testVideoUrl}
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  <div className={styles.testVideoPlaceholder}>
                    <Play size={36} color="rgba(255, 255, 255, 0.2)" />
                    <span>Select a video and tap Play to verify decode & sound</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Configuration & Environment Diagnostic */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Monitor size={22} />
              <span>Device & Configuration Info</span>
            </div>
            <table className={styles.infoTable}>
              <tbody>
                <tr>
                  <td className={styles.infoLabel}>Platform</td>
                  <td className={styles.infoVal} data-testid="info-platform">{bridge.platform.toUpperCase()}</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>Cards Per Page</td>
                  <td className={styles.infoVal}>{config.cards_per_page}</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>Idle Timeout</td>
                  <td className={styles.infoVal}>{config.idle_timeout_seconds}s</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>Controls Auto-Hide</td>
                  <td className={styles.infoVal}>{config.controls_auto_hide_seconds}s</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>Slideshow Mode</td>
                  <td className={styles.infoVal}>{config.slideshow_mode}</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>Screensaver Sound</td>
                  <td className={styles.infoVal}>{config.screensaver_sound ? 'Audible' : 'Muted'}</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>Sound Effects (SFX)</td>
                  <td className={styles.infoVal}>{config.sfx_enabled ? 'Enabled' : 'Disabled'}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => setShowExitConfirm(true)}
                data-testid="admin-exit-app-button"
              >
                <LogOut size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                Exit Kiosk Application
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      {showExitConfirm && (
        <div className={styles.modalBackdrop} data-testid="admin-exit-modal">
          <div className={styles.modalBox}>
            <h2>Exit Kiosk Application?</h2>
            <p>Are you sure you want to exit Kiosk mode and return to the system desktop/launcher?</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowExitConfirm(false)}
                data-testid="admin-exit-cancel-button"
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleExitApp}
                data-testid="admin-exit-confirm-button"
              >
                Yes, Exit App
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
