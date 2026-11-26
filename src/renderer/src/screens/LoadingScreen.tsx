import React from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import styles from './StateScreens.module.css';

export interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Preparing Media Library...',
}) => {
  return (
    <section className={styles.screenContainer} data-testid="loading-screen">
      <div className={styles.cardBox}>
        <motion.div
          className={styles.iconRing}
          animate={{ opacity: [0.75, 1, 0.75], scale: [0.97, 1.03, 0.97] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Play size={40} fill="currentColor" />
        </motion.div>
        <h1 className={styles.title}>Kiosk Video Player</h1>
        <p className={styles.description}>{message}</p>
        <div className={styles.loadingBarTrack} aria-hidden="true">
          <motion.div
            className={styles.loadingBarFill}
            animate={{ x: ['-100%', '220%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </section>
  );
};
