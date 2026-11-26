import React, { useEffect, useState } from 'react';
import styles from './Stage.module.css';

interface StageProps {
  children: React.ReactNode;
}

export const Stage: React.FC<StageProps> = ({ children }) => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const designWidth = 1920;
      const designHeight = 1080;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      const scaleX = windowWidth / designWidth;
      const scaleY = windowHeight / designHeight;
      const newScale = Math.min(scaleX, scaleY);
      setScale(newScale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  return (
    <div className={styles.viewportContainer}>
      <div
        data-testid="stage-container"
        className={styles.stageCanvas}
        style={{
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
};
