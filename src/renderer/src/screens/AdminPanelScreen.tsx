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
  Activity,
  Copy,
  Check,
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
import { STRINGS } from '../strings';
import {
  computeVerdict,
  buildDiagnosticsReportText,
  runFullDiagnostics,
} from '../services/DiagnosticsService';
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

  // Diagnostics state
  const [diagnosticsReport, setDiagnosticsReport] = useState<string | null>(null);
  const [diagnosticsProgress, setDiagnosticsProgress] = useState<string | null>(null);
  const [diagnosticsSavedPath, setDiagnosticsSavedPath] = useState<string | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  useEffect(() => {
    setInputPath(mediaRoot || config.kiosk_media_root);
  }, [mediaRoot, config.kiosk_media_root]);

  const handleRunDiagnostics = useCallback(async () => {
    setIsRunningDiagnostics(true);
    setCopiedReport(false);
    setDiagnosticsSavedPath(null);
    setDiagnosticsProgress('Initializing hardware & codec capability probes...');
    try {
      const videoEl = document.createElement('video');
      const codecs = [
        { name: 'H.264 (avc1.42E01E - Baseline)', mime: 'video/mp4; codecs="avc1.42E01E"' },
        { name: 'H.264 (avc1.4D401F - Main)', mime: 'video/mp4; codecs="avc1.4D401F"' },
        { name: 'H.264 (avc1.640028 - High 1080p)', mime: 'video/mp4; codecs="avc1.640028"' },
        { name: 'H.264 (avc1.640033 - High 4K)', mime: 'video/mp4; codecs="avc1.640033"' },
        { name: 'H.265/HEVC (hvc1.1.6.L93.B0 - Main)', mime: 'video/mp4; codecs="hvc1.1.6.L93.B0"' },
        { name: 'H.265/HEVC (hvc1.1.6.L150.B0 - 4K)', mime: 'video/mp4; codecs="hvc1.1.6.L150.B0"' },
        { name: 'H.265/HEVC (hev1.1.6.L150.B0 - 4K Alt)', mime: 'video/mp4; codecs="hev1.1.6.L150.B0"' },
        { name: 'VP9 (video/webm; codecs="vp9")', mime: 'video/webm; codecs="vp9"' },
        { name: 'AV1 (video/mp4; codecs="av01.0.08M.08")', mime: 'video/mp4; codecs="av01.0.08M.08"' },
        { name: 'AAC Audio (audio/mp4; codecs="mp4a.40.2")', mime: 'audio/mp4; codecs="mp4a.40.2"' },
      ];

      const codecCapabilities = codecs.map((c) => ({
        name: c.name,
        supported: videoEl.canPlayType(c.mime) || 'no',
      }));

      // Real sequential probe for EVERY media clip + screensaver
      const probeResults = await runFullDiagnostics(
        items,
        screensaver?.video_url,
        (current, total, name) => {
          setDiagnosticsProgress(`Probing clip [${current}/${total}]: ${name}...`);
        }
      );

      const verdict = computeVerdict(probeResults);

      const initialReport = buildDiagnosticsReportText({
        platform: bridge.platform,
        userAgent: navigator.userAgent,
        screenWidth: window.screen?.width ?? 'unknown',
        screenHeight: window.screen?.height ?? 'unknown',
        dpr: window.devicePixelRatio || 1,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        codecCapabilities,
        mediaRoot: config.kiosk_media_root,
        playablePairsCount: items.length,
        screensaverStatus: screensaver ? 'Present' : 'Missing',
        orphanCount,
        scanErrorsCount: scanErrors.length,
        clips: probeResults,
        verdict,
      });

      // Persist report via allow-listed Rust command
      let savedPath: string | undefined;
      try {
        savedPath = await bridge.writeDiagnostics(initialReport);
        setDiagnosticsSavedPath(savedPath);
      } catch (saveErr) {
        savedPath = undefined;
        console.warn('Failed to save diagnostics report to disk:', saveErr);
      }

      const finalReport = buildDiagnosticsReportText({
        platform: bridge.platform,
        userAgent: navigator.userAgent,
        screenWidth: window.screen?.width ?? 'unknown',
        screenHeight: window.screen?.height ?? 'unknown',
        dpr: window.devicePixelRatio || 1,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        codecCapabilities,
        mediaRoot: config.kiosk_media_root,
        playablePairsCount: items.length,
        screensaverStatus: screensaver ? 'Present' : 'Missing',
        orphanCount,
        scanErrorsCount: scanErrors.length,
        clips: probeResults,
        verdict,
        savedFilePath: savedPath,
      });

      setDiagnosticsReport(finalReport);
      setDiagnosticsProgress(null);
      void bridge.logClientMessage('INFO', `Hardware & Video Diagnostics executed:\n${finalReport}`);
    } catch (err) {
      setDiagnosticsReport(`Diagnostics error: ${String(err)}`);
      setDiagnosticsProgress(null);
    } finally {
      setIsRunningDiagnostics(false);
    }
  }, [bridge.platform, config, items, screensaver, orphanCount, scanErrors]);

  const handleCopyReport = useCallback(() => {
    if (!diagnosticsReport) return;
    void navigator.clipboard?.writeText(diagnosticsReport);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  }, [diagnosticsReport]);

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
          <h1>{STRINGS.admin.title}</h1>
          <p>{STRINGS.admin.subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            data-testid="admin-close-button"
            aria-label={STRINGS.admin.closeAriaLabel}
          >
            <X size={20} />
            <span>{STRINGS.admin.returnToGallery}</span>
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
              <span>{STRINGS.admin.sections.mediaRoot}</span>
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
                {STRINGS.admin.actions.validate}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleApplyInputFolder}
                disabled={isRescanning}
                data-testid="admin-save-folder-button"
              >
                {isRescanning ? 'Scanning...' : STRINGS.admin.actions.applyAndRescan}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {bridge.platform !== 'android' ? (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handlePickFolder}
                  data-testid="admin-pick-folder-button"
                >
                  <Folder size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                  {STRINGS.admin.actions.browse}
                </button>
              ) : (
                <div className={styles.androidFolderHint} data-testid="admin-android-hint">
                  {STRINGS.admin.androidFolderHint}
                </div>
              )}
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleForceRescan}
                disabled={isRescanning}
                data-testid="admin-rescan-button"
              >
                <RefreshCw size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                {STRINGS.admin.actions.forceRescan}
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
              <span>{STRINGS.admin.sections.integrity}</span>
            </div>
            <div className={styles.statsGrid}>
              <div className={styles.statTile}>
                <div className={styles.statLabel}>{STRINGS.admin.stats.playablePairs}</div>
                <div className={`${styles.statValue} ${styles.statValueCyan}`} data-testid="stat-pairs-count">
                  {items.length}
                </div>
              </div>
              <div className={styles.statTile}>
                <div className={styles.statLabel}>{STRINGS.admin.stats.ignoredOrphans}</div>
                <div
                  className={`${styles.statValue} ${orphanCount > 0 ? styles.statValueWarning : styles.statValueSuccess}`}
                  data-testid="stat-orphans-count"
                >
                  {orphanCount}
                </div>
              </div>
              <div className={styles.statTile}>
                <div className={styles.statLabel}>{STRINGS.admin.stats.totalVideos}</div>
                <div className={styles.statValue} data-testid="stat-videos-count">
                  {videoCount}
                </div>
              </div>
              <div className={styles.statTile}>
                <div className={styles.statLabel}>{STRINGS.admin.stats.totalImages}</div>
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
                    {STRINGS.admin.stats.screensaverPresent}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle size={18} color="#fbbf24" />
                  <span style={{ color: '#fbbf24' }} data-testid="stat-screensaver-status">
                    {STRINGS.admin.stats.screensaverMissing}
                  </span>
                </>
              )}
            </div>

            {scanErrors && scanErrors.length > 0 && (
              <div className={styles.errorsBox} data-testid="admin-scan-errors">
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>{STRINGS.admin.stats.scanErrors(scanErrors.length)}:</div>
                {scanErrors.map((err, idx) => (
                  <div key={idx}>• {err}</div>
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
              <span>{STRINGS.admin.sections.testPlayback}</span>
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
                  {screensaver && <option value="__screensaver__">{STRINGS.admin.testPlayback.screensaverLabel}</option>}
                  {items.map((item: MediaItem) => (
                    <option key={item.id} value={item.id}>
                      {item.display_title} ({item.filename})
                    </option>
                  ))}
                  {items.length === 0 && !screensaver && (
                    <option value="" disabled>
                      {STRINGS.admin.testPlayback.noVideos}
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
                    {STRINGS.admin.actions.play}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={handleStopTestPlay}
                    data-testid="admin-test-stop-button"
                  >
                    <Square size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                    {STRINGS.admin.actions.stop}
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
                    <span>{STRINGS.admin.testPlayback.hint}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Configuration & Environment Diagnostic */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Monitor size={22} />
              <span>{STRINGS.admin.sections.deviceInfo}</span>
            </div>
            <table className={styles.infoTable}>
              <tbody>
                <tr>
                  <td className={styles.infoLabel}>{STRINGS.admin.configKeys.platform}</td>
                  <td className={styles.infoVal} data-testid="info-platform">{bridge.platform.toUpperCase()}</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>{STRINGS.admin.configKeys.cardsPerPage}</td>
                  <td className={styles.infoVal}>{config.cards_per_page}</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>{STRINGS.admin.configKeys.idleTimeout}</td>
                  <td className={styles.infoVal}>{config.idle_timeout_seconds}s</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>{STRINGS.admin.configKeys.controlsAutoHide}</td>
                  <td className={styles.infoVal}>{config.controls_auto_hide_seconds}s</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>{STRINGS.admin.configKeys.slideshowMode}</td>
                  <td className={styles.infoVal}>{config.slideshow_mode}</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>{STRINGS.admin.configKeys.screensaverSound}</td>
                  <td className={styles.infoVal}>{config.screensaver_sound ? 'Audible' : 'Muted'}</td>
                </tr>
                <tr>
                  <td className={styles.infoLabel}>{STRINGS.admin.configKeys.sfxEnabled}</td>
                  <td className={styles.infoVal}>{config.sfx_enabled ? 'Enabled' : 'Disabled'}</td>
                </tr>
              </tbody>
            </table>

            {/* Diagnostics Probe Section */}
            <div className={styles.diagnosticsSection} data-testid="admin-diagnostics-section">
              <div className={styles.diagnosticsHeader}>
                <span className={styles.diagnosticsTitle}>
                  <Activity size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                  {STRINGS.admin.sections.diagnostics}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {diagnosticsReport && (
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={handleCopyReport}
                      data-testid="admin-copy-diagnostics-button"
                      style={{ padding: '6px 14px', fontSize: '13px' }}
                    >
                      {copiedReport ? (
                        <>
                          <Check size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />
                          {STRINGS.admin.actions.copiedReport}
                        </>
                      ) : (
                        <>
                          <Copy size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />
                          {STRINGS.admin.actions.copyReport}
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleRunDiagnostics}
                    disabled={isRunningDiagnostics}
                    data-testid="admin-run-diagnostics-button"
                    style={{ padding: '6px 14px', fontSize: '13px' }}
                  >
                    <Activity size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />
                    {isRunningDiagnostics
                      ? STRINGS.admin.actions.runningDiagnostics
                      : STRINGS.admin.actions.runDiagnostics}
                  </button>
                </div>
              </div>

              {isRunningDiagnostics && diagnosticsProgress && (
                <div
                  style={{
                    padding: '10px 14px',
                    margin: '10px 0',
                    background: 'rgba(0, 150, 255, 0.15)',
                    border: '1px solid rgba(0, 180, 255, 0.3)',
                    borderRadius: '6px',
                    color: '#60CDFF',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                  data-testid="admin-diagnostics-progress"
                >
                  <RefreshCw size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom', animation: 'spin 1s linear infinite' }} />
                  {diagnosticsProgress}
                </div>
              )}

              {diagnosticsSavedPath && (
                <div
                  style={{
                    padding: '8px 12px',
                    margin: '8px 0',
                    background: 'rgba(52, 199, 89, 0.15)',
                    border: '1px solid rgba(52, 199, 89, 0.3)',
                    borderRadius: '6px',
                    color: '#30D158',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                  data-testid="admin-diagnostics-saved-path"
                >
                  <CheckCircle size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                  Report saved to: <strong>{diagnosticsSavedPath}</strong>
                </div>
              )}

              {diagnosticsReport && (
                <div
                  className={styles.diagnosticsBox}
                  data-testid="admin-diagnostics-report"
                  role="region"
                  aria-label="Diagnostics Report"
                >
                  {diagnosticsReport}
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => setShowExitConfirm(true)}
                data-testid="admin-exit-app-button"
              >
                <LogOut size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                {STRINGS.admin.actions.exitKiosk}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      {showExitConfirm && (
        <div className={styles.modalBackdrop} data-testid="admin-exit-modal">
          <div className={styles.modalBox}>
            <h2>{STRINGS.admin.exitDialog.title}</h2>
            <p>
              {bridge.platform === 'android'
                ? STRINGS.admin.exitDialog.androidBody
                : STRINGS.admin.exitDialog.desktopBody}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowExitConfirm(false)}
                data-testid="admin-exit-cancel-button"
              >
                {STRINGS.admin.exitDialog.cancel}
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleExitApp}
                data-testid="admin-exit-confirm-button"
              >
                {STRINGS.admin.exitDialog.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
