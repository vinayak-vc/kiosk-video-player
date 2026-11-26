import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stage } from '../renderer/src/components/Stage';

describe('Stage Component Scaling', () => {
  it('renders fixed 1920x1080 stage inside container', () => {
    render(
      <Stage>
        <div data-testid="content">Kiosk Content</div>
      </Stage>
    );

    const stageEl = screen.getByTestId('stage-container');
    expect(stageEl).toBeInTheDocument();
    expect(stageEl.style.width).toBe('1920px');
    expect(stageEl.style.height).toBe('1080px');
    expect(screen.getByTestId('content')).toHaveTextContent('Kiosk Content');
  });
});
