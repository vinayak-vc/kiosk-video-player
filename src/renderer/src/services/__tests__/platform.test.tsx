import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { bridge } from '../bridge';
import { PlayerControls } from '../../components/PlayerControls';
import { EmptyScreen } from '../../screens/EmptyScreen';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe('Platform split (bridge.platform & desktop-only UI affordances)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.platform = 'windows';
  });

  it('initPlatform caches platform returned by get_platform command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('android');
    const platform = await bridge.initPlatform();
    expect(invoke).toHaveBeenCalledWith('get_platform');
    expect(platform).toBe('android');
    expect(bridge.platform).toBe('android');
  });

  it('hides fullscreen toggle in PlayerControls on android', () => {
    bridge.platform = 'android';
    render(
      <PlayerControls
        title="Test Video"
        visible={true}
        isPlaying={true}
        currentTime={10}
        duration={60}
        isDurationKnown={true}
        volume={1}
        isMuted={false}
        isFullscreen={true}
        onTogglePlay={() => {}}
        onSeek={() => {}}
        onVolumeChange={() => {}}
        onToggleMute={() => {}}
        onToggleFullscreen={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });

  it('shows fullscreen toggle in PlayerControls on windows', () => {
    bridge.platform = 'windows';
    render(
      <PlayerControls
        title="Test Video"
        visible={true}
        isPlaying={true}
        currentTime={10}
        duration={60}
        isDurationKnown={true}
        volume={1}
        isMuted={false}
        isFullscreen={true}
        onTogglePlay={() => {}}
        onSeek={() => {}}
        onVolumeChange={() => {}}
        onToggleMute={() => {}}
        onToggleFullscreen={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /fullscreen/i })).toBeTruthy();
  });

  it('renders Grant file access button when permissionDenied is true on EmptyScreen', () => {
    const onGrant = vi.fn();
    render(
      <EmptyScreen
        root="/storage/emulated/0/Kiosk/Media"
        videoCount={0}
        imageCount={0}
        permissionDenied={true}
        onGrantPermission={onGrant}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText('Storage Permission Required')).toBeTruthy();
    const btn = screen.getByRole('button', { name: /grant file access/i });
    expect(btn).toBeTruthy();
  });
});
