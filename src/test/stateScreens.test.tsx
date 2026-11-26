import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { classifyEmptyState, EmptyScreen } from '../renderer/src/screens/EmptyScreen';
import { ErrorScreen } from '../renderer/src/screens/ErrorScreen';
import { LoadingScreen } from '../renderer/src/screens/LoadingScreen';

describe('Empty state classification and EmptyScreen', () => {
  it('classifies all 5 empty state variants accurately', () => {
    expect(classifyEmptyState({ root: '', videoCount: 0, imageCount: 0 })).toBe('NO_FOLDER');
    expect(classifyEmptyState({ root: 'C:/Media', videoCount: 0, imageCount: 0 })).toBe('EMPTY_FOLDER');
    expect(classifyEmptyState({ root: 'C:/Media', videoCount: 3, imageCount: 0 })).toBe('ONLY_VIDEOS');
    expect(classifyEmptyState({ root: 'C:/Media', videoCount: 0, imageCount: 4 })).toBe('ONLY_IMAGES');
    expect(classifyEmptyState({ root: 'C:/Media', videoCount: 2, imageCount: 2 })).toBe('NO_VALID_PAIRS');
  });

  it.each([
    { root: '', videoCount: 0, imageCount: 0, expected: 'NO_FOLDER', text: 'No Media Folder Configured' },
    { root: 'C:/Media', videoCount: 0, imageCount: 0, expected: 'EMPTY_FOLDER', text: 'Media Folder Is Empty' },
    { root: 'C:/Media', videoCount: 2, imageCount: 0, expected: 'ONLY_VIDEOS', text: 'Thumbnails Missing' },
    { root: 'C:/Media', videoCount: 0, imageCount: 3, expected: 'ONLY_IMAGES', text: 'Videos Missing' },
    { root: 'C:/Media', videoCount: 2, imageCount: 2, expected: 'NO_VALID_PAIRS', text: 'No Matching Video Pairs' },
  ])('renders EmptyScreen for $expected', ({ root, videoCount, imageCount, expected, text }) => {
    const onSelect = vi.fn();
    const onRetry = vi.fn();
    render(
      <EmptyScreen
        root={root}
        videoCount={videoCount}
        imageCount={imageCount}
        onSelectFolder={onSelect}
        onRetry={onRetry}
      />
    );
    expect(screen.getByTestId('empty-screen')).toHaveAttribute('data-empty-variant', expected);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('ErrorScreen and LoadingScreen', () => {
  it('renders ErrorScreen and invokes Select another folder + Retry', async () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(
      <ErrorScreen
        errorReason="Media folder does not exist"
        mediaRoot="C:/Missing/Media"
        onSelectFolder={onSelect}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Unable to Load Media')).toBeInTheDocument();
    expect(screen.getByText('Media folder does not exist')).toBeInTheDocument();
    expect(screen.getByText('C:/Missing/Media')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Select another folder/i }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders LoadingScreen with custom message', () => {
    render(<LoadingScreen message="Scanning Media Library..." />);
    expect(screen.getByTestId('loading-screen')).toBeInTheDocument();
    expect(screen.getByText('Scanning Media Library...')).toBeInTheDocument();
  });
});
