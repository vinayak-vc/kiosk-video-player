import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { formatTime, PlayerControls } from '../renderer/src/components/PlayerControls';

describe('formatTime helper', () => {
  it('formats mm:ss, h:mm:ss, and unknown duration', () => {
    expect(formatTime(0, true)).toBe('0:00');
    expect(formatTime(65, true)).toBe('1:05');
    expect(formatTime(3661, true)).toBe('1:01:01');
    expect(formatTime(NaN, false)).toBe('--:--');
    expect(formatTime(100, false)).toBe('--:--');
  });
});

describe('PlayerControls interactions', () => {
  const baseProps = {
    title: 'Adani',
    visible: true,
    isPlaying: true,
    currentTime: 30,
    duration: 120,
    isDurationKnown: true,
    volume: 0.8,
    isMuted: false,
    isFullscreen: true,
    onTogglePlay: vi.fn(),
    onSeek: vi.fn(),
    onVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onBack: vi.fn(),
    onUserInteraction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays formatted time and triggers play/pause, mute, volume, fullscreen, and back', () => {
    render(<PlayerControls {...baseProps} />);
    expect(screen.getByTestId('player-time-label')).toHaveTextContent('0:30 / 2:00');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(baseProps.onTogglePlay).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(baseProps.onToggleMute).toHaveBeenCalledTimes(1);

    const volumeSlider = screen.getByTestId('player-volume-slider');
    volumeSlider.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, right: 300, bottom: 64, height: 64 } as DOMRect);

    // Primary pointer drag to 40% (x=180 on 100..300)
    fireEvent.pointerDown(volumeSlider, { clientX: 180, pointerId: 1, isPrimary: true });
    expect(baseProps.onVolumeChange).toHaveBeenCalledWith(0.4);

    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(baseProps.onToggleFullscreen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Back to gallery' }));
    expect(baseProps.onBack).toHaveBeenCalledTimes(1);
  });

  it('seeks via pointer capture drag on timeline', () => {
    render(<PlayerControls {...baseProps} />);
    const timeline = screen.getByTestId('player-timeline');
    timeline.getBoundingClientRect = () =>
      ({ left: 100, width: 400, top: 0, right: 500, bottom: 40, height: 40 } as DOMRect);

    fireEvent.pointerDown(timeline, { clientX: 200, pointerId: 1 }); // 25% of 120 = 30
    expect(baseProps.onSeek).toHaveBeenCalledWith(30);

    fireEvent.pointerUp(timeline, { clientX: 300, pointerId: 1 }); // 50% of 120 = 60
    expect(baseProps.onSeek).toHaveBeenLastCalledWith(60);
  });

  it('aborts timeline scrub on pointerCancel without calling onSeek', () => {
    render(<PlayerControls {...baseProps} />);
    const timeline = screen.getByTestId('player-timeline');
    timeline.getBoundingClientRect = () =>
      ({ left: 100, width: 400, top: 0, right: 500, bottom: 40, height: 40 } as DOMRect);

    fireEvent.pointerDown(timeline, { clientX: 200, pointerId: 1, isPrimary: true });
    expect(baseProps.onSeek).toHaveBeenCalledWith(30);
    vi.clearAllMocks();

    // Trigger pointerCancel — must abort scrub and NOT call onSeek
    fireEvent.pointerCancel(timeline, { clientX: 350, pointerId: 1, isPrimary: true });
    expect(baseProps.onSeek).not.toHaveBeenCalled();
  });

  it('ignores non-primary pointer events on custom volume slider', () => {
    render(<PlayerControls {...baseProps} />);
    const volumeSlider = screen.getByTestId('player-volume-slider');
    volumeSlider.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, right: 300, bottom: 64, height: 64 } as DOMRect);

    // Non-primary pointer event (palm touch / secondary touch)
    fireEvent.pointerDown(volumeSlider, { clientX: 180, pointerId: 2, isPrimary: false });
    expect(baseProps.onVolumeChange).not.toHaveBeenCalled();
  });

  it('shows center play indicator when paused even if bottom bar is hidden', () => {
    render(<PlayerControls {...baseProps} visible={false} isPlaying={false} />);
    const centerBtn = screen.getByTestId('center-play-indicator');
    expect(centerBtn).toBeInTheDocument();
    fireEvent.click(centerBtn);
    expect(baseProps.onTogglePlay).toHaveBeenCalledTimes(1);
  });
});
