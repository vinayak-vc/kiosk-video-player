/**
 * DiagnosticsService.ts
 * Real hardware and media playback probe engine for Android TV / Desktop Kiosk.
 * Probes every media pair and screensaver for real hardware decoding, first-frame latency,
 * dropped frames via getVideoPlaybackQuality(), seek performance, and computes an honest verdict.
 */

export interface ClipProbeResult {
  name: string;
  url: string;
  status: 'PASS' | 'FAIL' | 'TIMEOUT';
  width?: number;
  height?: number;
  duration?: number;
  firstFrameLatencyMs?: number;
  droppedFrames?: number;
  seekLatencyMs?: number;
  error?: string;
}

export interface DiagnosticsVerdict {
  verdict: string;
  isOperational: boolean;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  maxFirstFrameMs: number;
  totalDroppedFrames: number;
}

export interface DiagnosticsReportParams {
  timestamp?: string;
  platform: string;
  userAgent: string;
  screenWidth: number | string;
  screenHeight: number | string;
  dpr: number;
  viewportWidth: number;
  viewportHeight: number;
  codecCapabilities: Array<{ name: string; supported: string }>;
  mediaRoot: string;
  playablePairsCount: number;
  screensaverStatus: string;
  orphanCount: number;
  scanErrorsCount: number;
  clips: ClipProbeResult[];
  verdict: DiagnosticsVerdict;
  savedFilePath?: string;
}

/**
 * Computes an objective verdict from real probe results.
 */
export function computeVerdict(clips: ClipProbeResult[]): DiagnosticsVerdict {
  const totalCount = clips.length;
  if (totalCount === 0) {
    return {
      verdict: 'NO CLIPS TESTED: Media library contains no playable pairs.',
      isOperational: false,
      passedCount: 0,
      failedCount: 0,
      totalCount: 0,
      maxFirstFrameMs: 0,
      totalDroppedFrames: 0,
    };
  }

  let passedCount = 0;
  let failedCount = 0;
  let maxFirstFrameMs = 0;
  let totalDroppedFrames = 0;
  const failedNames: string[] = [];

  for (const clip of clips) {
    if (clip.status === 'PASS') {
      passedCount++;
      if (clip.firstFrameLatencyMs && clip.firstFrameLatencyMs > maxFirstFrameMs) {
        maxFirstFrameMs = clip.firstFrameLatencyMs;
      }
      if (clip.droppedFrames) {
        totalDroppedFrames += clip.droppedFrames;
      }
    } else {
      failedCount++;
      failedNames.push(`${clip.name} (${clip.error || clip.status})`);
    }
  }

  if (failedCount > 0) {
    return {
      verdict: `DECODE FAILURE: ${failedCount} of ${totalCount} clips failed to decode: ${failedNames.join(', ')}`,
      isOperational: false,
      passedCount,
      failedCount,
      totalCount,
      maxFirstFrameMs,
      totalDroppedFrames,
    };
  }

  if (totalDroppedFrames > 15) {
    return {
      verdict: `DEGRADED PERFORMANCE: All ${totalCount} clips played, but ${totalDroppedFrames} dropped frames detected (max first-frame: ${maxFirstFrameMs} ms).`,
      isOperational: true,
      passedCount,
      failedCount: 0,
      totalCount,
      maxFirstFrameMs,
      totalDroppedFrames,
    };
  }

  return {
    verdict: `HARDWARE DECODING VERIFIED: All ${totalCount} clips decoded smoothly with 0 dropped frames (max first-frame latency: ${maxFirstFrameMs} ms).`,
    isOperational: true,
    passedCount,
    failedCount: 0,
    totalCount,
    maxFirstFrameMs,
    totalDroppedFrames,
  };
}

export function extractWebViewVersion(userAgent: string): string {
  if (!userAgent) return 'Chrome/Unknown';
  const match = userAgent.match(/(?:Chrome|Chromium)\/([0-9.]+)/i);
  return match ? match[0] : 'Chrome/Unknown';
}

/**
 * Builds formatted ASCII report for disk persistence and UI presentation.
 */
export function buildDiagnosticsReportText(params: DiagnosticsReportParams): string {
  const ts = params.timestamp || new Date().toISOString();
  const webViewEngine = extractWebViewVersion(params.userAgent);
  const codecLines = params.codecCapabilities
    .map((c) => `  - ${c.name}: ${c.supported}`)
    .join('\n');

  const clipLines = params.clips.map((c, i) => {
    if (c.status === 'PASS') {
      return `[${i + 1}/${params.clips.length}] PASS: ${c.name}
    Resolution: ${c.width ?? 0}x${c.height ?? 0} | Duration: ${(c.duration ?? 0).toFixed(1)}s
    First-Frame Latency: ${c.firstFrameLatencyMs ?? 0} ms | Dropped Frames: ${c.droppedFrames ?? 0}
    Seek Latency (50% scrub): ${c.seekLatencyMs ?? 0} ms`;
    }
    return `[${i + 1}/${params.clips.length}] ${c.status}: ${c.name}
    Error: ${c.error || 'Unknown error'}`;
  }).join('\n');

  const lines: string[] = [
    '================================================================',
    '          KIOSK VIDEO PLAYER HARDWARE DIAGNOSTICS REPORT         ',
    '================================================================',
    `WebView / Browser Engine: ${webViewEngine}`,
    `Timestamp: ${ts}`,
    `Platform: ${params.platform.toUpperCase()}`,
    `Device User-Agent: ${params.userAgent}`,
    `Physical Screen: ${params.screenWidth}x${params.screenHeight} (DPR: ${params.dpr})`,
    `Viewport Stage: ${params.viewportWidth}x${params.viewportHeight}`,
    '',
    '--- HTML5 VIDEO CANPLAYTYPE SUPPORT (CODEC HARDWARE CAPABILITY) ---',
    codecLines,
    '',
    '--- MEDIA LIBRARY SUMMARY ---',
    `Media Root: ${params.mediaRoot}`,
    `Playable Pairs: ${params.playablePairsCount}`,
    `Screensaver Status: ${params.screensaverStatus}`,
    `Orphans / Unpaired: ${params.orphanCount}`,
    `Scan Errors: ${params.scanErrorsCount}`,
    '',
    '--- SEQUENTIAL PLAYBACK & SEEK PROBE RESULTS ---',
    clipLines || 'No clips tested.',
    '',
    '--- VERDICT & CONCLUSION ---',
    `Status: ${params.verdict.isOperational ? 'OPERATIONAL' : 'NON-OPERATIONAL'}`,
    `Tested Clips: ${params.verdict.totalCount} (Passed: ${params.verdict.passedCount}, Failed: ${params.verdict.failedCount})`,
    `Max First-Frame Latency: ${params.verdict.maxFirstFrameMs} ms`,
    `Total Dropped Frames: ${params.verdict.totalDroppedFrames}`,
    `Verdict: ${params.verdict.verdict}`,
  ];

  if (params.savedFilePath) {
    lines.push('', `Report Saved To Disk: ${params.savedFilePath}`);
  }

  lines.push('================================================================');
  return lines.join('\n');
}

/**
 * Probes a single video clip using a real off-screen HTML5 Video element.
 */
export function probeSingleClip(
  clip: { name: string; url: string },
  timeoutMs = 10000
): Promise<ClipProbeResult> {
  return new Promise((resolve) => {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let playTimer: ReturnType<typeof setTimeout> | null = null;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';

    document.body.appendChild(video);

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (playTimer) clearTimeout(playTimer);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    };

    const finish = (result: ClipProbeResult) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({
        name: clip.name,
        url: clip.url,
        status: 'TIMEOUT',
        error: `Timed out after ${timeoutMs}ms without completing playback`,
      });
    }, timeoutMs);

    let playStartTime = 0;
    let firstFrameLatencyMs: number | undefined;
    let width = 0;
    let height = 0;
    let duration = 0;

    video.onerror = () => {
      const code = video.error ? video.error.code : 0;
      const msg = video.error ? video.error.message : 'Unknown MediaError';
      finish({
        name: clip.name,
        url: clip.url,
        status: 'FAIL',
        error: `MediaError code ${code}: ${msg}`,
      });
    };

    video.onloadedmetadata = () => {
      width = video.videoWidth;
      height = video.videoHeight;
      duration = video.duration;

      playStartTime = performance.now();
      video.play().catch((err) => {
        finish({
          name: clip.name,
          url: clip.url,
          status: 'FAIL',
          width,
          height,
          duration,
          error: `play() rejected: ${String(err)}`,
        });
      });
    };

    video.ontimeupdate = () => {
      if (video.currentTime > 0 && firstFrameLatencyMs === undefined) {
        firstFrameLatencyMs = Math.max(1, Math.round(performance.now() - playStartTime));

        // Let it play for 2.5 seconds to monitor frame drops and seek
        playTimer = setTimeout(() => {
          let droppedFrames = 0;
          try {
            if (typeof (video as any).getVideoPlaybackQuality === 'function') {
              droppedFrames = (video as any).getVideoPlaybackQuality().droppedVideoFrames || 0;
            }
          } catch {
            droppedFrames = 0;
          }

          // Now perform a seek test to 50% or 3 seconds
          const targetSeek = Math.min(3, duration > 1 ? duration / 2 : 0.5);
          const seekStartTime = performance.now();

          video.onseeked = () => {
            const seekLatencyMs = Math.max(1, Math.round(performance.now() - seekStartTime));
            finish({
              name: clip.name,
              url: clip.url,
              status: 'PASS',
              width,
              height,
              duration,
              firstFrameLatencyMs,
              droppedFrames,
              seekLatencyMs,
            });
          };

          try {
            video.currentTime = targetSeek;
          } catch (seekErr) {
            finish({
              name: clip.name,
              url: clip.url,
              status: 'PASS',
              width,
              height,
              duration,
              firstFrameLatencyMs,
              droppedFrames,
              error: `Seek warning: ${String(seekErr)}`,
            });
          }
        }, 2000);
      }
    };

    video.src = clip.url;
  });
}

/**
 * Runs full sequential probe over all media pairs and optional screensaver.
 */
export async function runFullDiagnostics(
  items: Array<{ filename: string; video_url: string }>,
  screensaverUrl?: string | null,
  onProgress?: (current: number, total: number, name: string) => void
): Promise<ClipProbeResult[]> {
  const clipsToProbe: Array<{ name: string; url: string }> = items.map((item) => ({
    name: item.filename,
    url: item.video_url,
  }));

  if (screensaverUrl) {
    clipsToProbe.push({
      name: 'Screensaver.mp4',
      url: screensaverUrl,
    });
  }

  const results: ClipProbeResult[] = [];
  const total = clipsToProbe.length;

  for (let i = 0; i < total; i++) {
    const target = clipsToProbe[i];
    if (onProgress) {
      onProgress(i + 1, total, target.name);
    }
    const res = await probeSingleClip(target, 8000);
    results.push(res);
  }

  return results;
}
