import React from 'react';
import styles from './PageIndicator.module.css';

export interface PageIndicatorProps {
  totalPages: number;
  currentPage: number;
  onSelectPage: (page: number) => void;
}

export const PageIndicator: React.FC<PageIndicatorProps> = React.memo(
  ({ totalPages, currentPage, onSelectPage }) => {
    if (totalPages <= 1) return null;

    return (
      <nav className={styles.indicatorRow} aria-label="Gallery pages" data-testid="page-indicator">
        {Array.from({ length: totalPages }, (_, index) => {
          const isActive = index === currentPage;
          return (
            <button
              key={index}
              type="button"
              className={styles.dotButton}
              aria-label={`Page ${index + 1}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectPage(index)}
            >
              <span className={`${styles.dot} ${isActive ? styles.dotActive : ''}`} />
            </button>
          );
        })}
      </nav>
    );
  }
);

PageIndicator.displayName = 'PageIndicator';
