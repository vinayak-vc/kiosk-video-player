import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Stage } from '../renderer/src/components/Stage';

describe('Stage Resolution & Aspect Ratio Scaling Suite', () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;

  const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
  };

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalWidth });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: originalHeight });
  });

  it('calculates exact scale 0.666667 for 1280x720 (720p 16:9)', () => {
    setViewport(1280, 720);
    render(
      <Stage>
        <div data-testid="content">Content</div>
      </Stage>
    );

    const stage = screen.getByTestId('stage-container');
    const scale = 1280 / 1920; // 0.6666666666666666
    expect(stage.style.transform).toBe(`scale(${scale})`);
  });

  it('calculates exact scale 1 for 1920x1080 (1080p native design)', () => {
    setViewport(1920, 1080);
    render(
      <Stage>
        <div data-testid="content">Content</div>
      </Stage>
    );

    const stage = screen.getByTestId('stage-container');
    expect(stage.style.transform).toBe('scale(1)');
  });

  it('calculates exact scale 1.333333 for 2560x1440 (1440p 16:9)', () => {
    setViewport(2560, 1440);
    render(
      <Stage>
        <div data-testid="content">Content</div>
      </Stage>
    );

    const stage = screen.getByTestId('stage-container');
    const scale = 2560 / 1920; // 1.3333333333333333
    expect(stage.style.transform).toBe(`scale(${scale})`);
  });

  it('calculates exact scale 2 for 3840x2160 (4K 16:9)', () => {
    setViewport(3840, 2160);
    render(
      <Stage>
        <div data-testid="content">Content</div>
      </Stage>
    );

    const stage = screen.getByTestId('stage-container');
    expect(stage.style.transform).toBe('scale(2)');
  });

  it('applies letterbox rule (min scale) for non-16:9 viewport (1920x1200 16:10)', () => {
    setViewport(1920, 1200);
    render(
      <Stage>
        <div data-testid="content">Content</div>
      </Stage>
    );

    const stage = screen.getByTestId('stage-container');
    // scaleX = 1920/1920 = 1; scaleY = 1200/1080 = 1.1111; min = 1
    expect(stage.style.transform).toBe('scale(1)');
  });

  it('dynamically responds to window resize events', () => {
    setViewport(1920, 1080);
    render(
      <Stage>
        <div data-testid="content">Content</div>
      </Stage>
    );

    const stage = screen.getByTestId('stage-container');
    expect(stage.style.transform).toBe('scale(1)');

    // Resize to 4K
    setViewport(3840, 2160);
    expect(stage.style.transform).toBe('scale(2)');
  });

  it('cleans up resize listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <Stage>
        <div data-testid="content">Content</div>
      </Stage>
    );

    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
