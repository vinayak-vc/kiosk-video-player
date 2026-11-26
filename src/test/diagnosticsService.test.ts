import { describe, it, expect, vi } from 'vitest';
import {
  computeVerdict,
  buildDiagnosticsReportText,
  probeSingleClip,
  type ClipProbeResult,
} from '../renderer/src/services/DiagnosticsService';

describe('DiagnosticsService', () => {
  describe('computeVerdict', () => {
    it('returns non-operational when clips array is empty', () => {
      const verdict = computeVerdict([]);
      expect(verdict.isOperational).toBe(false);
      expect(verdict.totalCount).toBe(0);
      expect(verdict.verdict).toContain('NO CLIPS TESTED');
    });

    it('computes clean hardware operational verdict when all clips pass with 0 drops', () => {
      const mockClips: ClipProbeResult[] = [
        {
          name: 'clip1.mp4',
          url: 'http://kiosk-media.localhost/clip1.mp4',
          status: 'PASS',
          width: 1920,
          height: 1080,
          duration: 30,
          firstFrameLatencyMs: 45,
          droppedFrames: 0,
          seekLatencyMs: 12,
        },
        {
          name: 'clip2.mp4',
          url: 'http://kiosk-media.localhost/clip2.mp4',
          status: 'PASS',
          width: 1920,
          height: 1080,
          duration: 60,
          firstFrameLatencyMs: 82,
          droppedFrames: 0,
          seekLatencyMs: 18,
        },
      ];

      const verdict = computeVerdict(mockClips);
      expect(verdict.isOperational).toBe(true);
      expect(verdict.passedCount).toBe(2);
      expect(verdict.failedCount).toBe(0);
      expect(verdict.maxFirstFrameMs).toBe(82);
      expect(verdict.totalDroppedFrames).toBe(0);
      expect(verdict.verdict).toContain('HARDWARE DECODING VERIFIED');
    });

    it('computes failure verdict when any clip fails or times out', () => {
      const mockClips: ClipProbeResult[] = [
        {
          name: 'good.mp4',
          url: 'http://kiosk-media.localhost/good.mp4',
          status: 'PASS',
          width: 1920,
          height: 1080,
          duration: 30,
          firstFrameLatencyMs: 50,
          droppedFrames: 0,
        },
        {
          name: 'corrupted.mp4',
          url: 'http://kiosk-media.localhost/corrupted.mp4',
          status: 'FAIL',
          error: 'MediaError code 4: DEMUXER_ERROR',
        },
        {
          name: 'slow.mp4',
          url: 'http://kiosk-media.localhost/slow.mp4',
          status: 'TIMEOUT',
          error: 'Timed out after 10000ms',
        },
      ];

      const verdict = computeVerdict(mockClips);
      expect(verdict.isOperational).toBe(false);
      expect(verdict.passedCount).toBe(1);
      expect(verdict.failedCount).toBe(2);
      expect(verdict.verdict).toContain('DECODE FAILURE: 2 of 3 clips failed to decode');
      expect(verdict.verdict).toContain('corrupted.mp4');
      expect(verdict.verdict).toContain('slow.mp4');
    });

    it('flags degraded performance when dropped frames exceed threshold', () => {
      const mockClips: ClipProbeResult[] = [
        {
          name: 'janky.mp4',
          url: 'http://kiosk-media.localhost/janky.mp4',
          status: 'PASS',
          width: 3840,
          height: 2160,
          duration: 30,
          firstFrameLatencyMs: 220,
          droppedFrames: 35,
          seekLatencyMs: 95,
        },
      ];

      const verdict = computeVerdict(mockClips);
      expect(verdict.isOperational).toBe(true);
      expect(verdict.totalDroppedFrames).toBe(35);
      expect(verdict.verdict).toContain('DEGRADED PERFORMANCE');
      expect(verdict.verdict).toContain('35 dropped frames detected');
    });
  });

  describe('buildDiagnosticsReportText', () => {
    it('formats a complete, human-readable report with all fields and saved path', () => {
      const clips: ClipProbeResult[] = [
        {
          name: 'Sample.mp4',
          url: 'http://kiosk-media.localhost/Sample.mp4',
          status: 'PASS',
          width: 1920,
          height: 1080,
          duration: 25.5,
          firstFrameLatencyMs: 65,
          droppedFrames: 0,
          seekLatencyMs: 14,
        },
      ];

      const verdict = computeVerdict(clips);
      const text = buildDiagnosticsReportText({
        platform: 'android',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; KioskTV)',
        screenWidth: 3840,
        screenHeight: 2160,
        dpr: 2,
        viewportWidth: 1920,
        viewportHeight: 1080,
        codecCapabilities: [{ name: 'H.264 High 1080p', supported: 'probably' }],
        mediaRoot: '/storage/emulated/0/Kiosk/Media',
        playablePairsCount: 1,
        screensaverStatus: 'Present',
        orphanCount: 0,
        scanErrorsCount: 0,
        clips,
        verdict,
        savedFilePath: '/storage/emulated/0/Kiosk/diagnostics.txt',
      });

      expect(text).toContain('KIOSK VIDEO PLAYER HARDWARE DIAGNOSTICS REPORT');
      expect(text).toContain('Platform: ANDROID');
      expect(text).toContain('Physical Screen: 3840x2160 (DPR: 2)');
      expect(text).toContain('Media Root: /storage/emulated/0/Kiosk/Media');
      expect(text).toContain('H.264 High 1080p: probably');
      expect(text).toContain('[1/1] PASS: Sample.mp4');
      expect(text).toContain('First-Frame Latency: 65 ms');
      expect(text).toContain('Seek Latency (50% scrub): 14 ms');
      expect(text).toContain('HARDWARE DECODING VERIFIED');
      expect(text).toContain('Report Saved To Disk: /storage/emulated/0/Kiosk/diagnostics.txt');
    });
  });

  describe('probeSingleClip', () => {
    it('probes a video and returns result on simulated loadedmetadata and timeupdate', async () => {
      vi.useFakeTimers();

      const probePromise = probeSingleClip({
        name: 'Test.mp4',
        url: 'blob:test',
      }, 5000);

      // Find the created video element
      const video = document.querySelector('video') as HTMLVideoElement;
      expect(video).toBeDefined();

      // Simulate metadata loaded
      Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
      Object.defineProperty(video, 'duration', { value: 10, configurable: true });
      Object.defineProperty(video, 'currentTime', { value: 0.1, writable: true, configurable: true });

      video.play = vi.fn().mockResolvedValue(undefined);

      // Trigger loadedmetadata
      video.onloadedmetadata?.(new Event('loadedmetadata'));

      // Advance time slightly and trigger timeupdate
      vi.advanceTimersByTime(50);
      video.ontimeupdate?.(new Event('timeupdate'));

      // Advance past the 2000ms play check
      vi.advanceTimersByTime(2100);

      // Trigger seeked
      video.onseeked?.(new Event('seeked'));

      const result = await probePromise;
      expect(result.status).toBe('PASS');
      expect(result.name).toBe('Test.mp4');
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);

      vi.useRealTimers();
    });
  });
});
