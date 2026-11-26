/**
 * IdleTimerService.ts
 * Single centralized inactivity timer for triggering Auto Slideshow from Gallery.
 * Components must never own navigation timers.
 */
export class KioskIdleTimerService {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private timeoutMs = 60_000;
  private onTimeout: (() => void) | null = null;
  private running = false;
  private paused = false;

  start(timeoutSeconds: number, onTimeout: () => void): void {
    this.stop();
    this.timeoutMs = Math.max(1, timeoutSeconds) * 1000;
    this.onTimeout = onTimeout;
    this.running = true;
    this.paused = false;
    this.schedule();
  }

  reset(): void {
    if (!this.running || !this.onTimeout) return;
    this.paused = false;
    this.clearTimer();
    this.schedule();
  }

  pause(): void {
    if (!this.running) return;
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    if (!this.running || !this.onTimeout) return;
    this.paused = false;
    this.clearTimer();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    this.onTimeout = null;
    this.clearTimer();
  }

  isActive(): boolean {
    return this.running && !this.paused;
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private schedule(): void {
    this.clearTimer();
    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.running = false;
      this.paused = false;
      this.onTimeout?.();
    }, this.timeoutMs);
  }
}

export const IdleTimerService = new KioskIdleTimerService();
