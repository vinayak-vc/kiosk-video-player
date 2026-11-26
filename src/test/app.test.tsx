import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { App } from '../renderer/src/app/App';
import { bridge } from '../renderer/src/services/bridge';
import { useApplicationStore } from '../renderer/src/stores/applicationStore';
import { useMediaStore } from '../renderer/src/stores/mediaStore';
import { useSettingsStore, DEFAULT_APP_CONFIG } from '../renderer/src/stores/settingsStore';

vi.mock('../renderer/src/services/bridge', () => ({
  bridge: {
    exitApp: vi.fn().mockResolvedValue(undefined),
    requestAdmin: vi.fn().mockResolvedValue(undefined),
    onAdminRequested: vi.fn().mockResolvedValue(() => {}),
    logClientMessage: vi.fn().mockResolvedValue(undefined),
    getAppConfig: vi.fn(),
    getMediaItems: vi.fn(),
    setMediaRoot: vi.fn(),
    onMediaChanged: vi.fn().mockResolvedValue(() => {}),
  },
}));

describe('App kiosk key guard & shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApplicationStore.getState().reset();
    useMediaStore.getState().reset();
    useSettingsStore.getState().reset();
    vi.mocked(bridge.getAppConfig).mockResolvedValue(DEFAULT_APP_CONFIG);
    vi.mocked(bridge.getMediaItems).mockResolvedValue({
      items: [],
      ignored_orphan_count: 0,
      video_count: 0,
      image_count: 0,
      errors: [],
      root: 'C:/Kiosk/Media',
    });
  });

  it('calls bridge.exitApp once on Ctrl+Alt+Q and prevents default', () => {
    render(<App />);
    const event = new KeyboardEvent('keydown', {
      key: 'q',
      ctrlKey: true,
      altKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(bridge.exitApp).toHaveBeenCalledTimes(1);
  });

  it('prevents default on Escape and does not exit', () => {
    render(<App />);
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(bridge.exitApp).not.toHaveBeenCalled();
  });

  it('calls bridge.requestAdmin on Ctrl+Alt+S and prevents default', () => {
    render(<App />);
    const event = new KeyboardEvent('keydown', {
      key: 'S',
      ctrlKey: true,
      altKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(bridge.requestAdmin).toHaveBeenCalledTimes(1);
  });

  it.each([
    { key: 'F5' },
    { key: 'F11' },
    { key: 'F12' },
    { key: 'r', ctrlKey: true },
    { key: 'p', ctrlKey: true },
    { key: '+', ctrlKey: true },
    { key: '=', ctrlKey: true },
  ])('blocks browser accelerator %o with preventDefault', (init) => {
    render(<App />);
    const event = new KeyboardEvent('keydown', {
      ...init,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('blocks Ctrl+wheel zoom with preventDefault', () => {
    render(<App />);
    const event = new WheelEvent('wheel', {
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('blocks contextmenu event', () => {
    render(<App />);
    const event = new MouseEvent('contextmenu', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('removes all event listeners and unsubscribes on unmount', async () => {
    const unlistenMock = vi.fn();
    vi.mocked(bridge.onAdminRequested).mockResolvedValueOnce(unlistenMock);
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    unmount();

    // Verify keydown, wheel, contextmenu were removed
    const removedEvents = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedEvents).toContain('keydown');
    expect(removedEvents).toContain('wheel');
    expect(removedEvents).toContain('contextmenu');

    // Wait microtask for unlistenAdmin promise resolution
    await Promise.resolve();
    expect(unlistenMock).toHaveBeenCalledTimes(1);

    // Ensure Ctrl+Alt+Q no longer triggers exitApp after unmount
    fireEvent.keyDown(window, { key: 'q', ctrlKey: true, altKey: true });
    expect(bridge.exitApp).not.toHaveBeenCalled();

    removeSpy.mockRestore();
  });
});
