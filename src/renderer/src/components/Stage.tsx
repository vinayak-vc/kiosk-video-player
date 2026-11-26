import React, { useEffect, useState } from 'react';

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
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        overflow: 'hidden',
      }}
    >
      <div
        data-testid="stage-container"
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at top, #0d163d 0%, #050814 70%)',
          boxShadow: '0 0 50px rgba(0, 128, 255, 0.2)',
        }}
      >
        {children}
      </div>
    </div>
  );
};
