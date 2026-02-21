import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import styles from './PhaseBannerOverlay.module.css';

interface PhaseBannerOverlayProps {
  readonly store: StoreApi<GameStore>;
}

function formatPhaseDisplayName(phaseId: string): string {
  return phaseId
    .replace(/[-_]/gu, ' ')
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

export function PhaseBannerOverlay({ store }: PhaseBannerOverlayProps): ReactElement | null {
  const activePhaseBanner = useStore(store, (state) => state.activePhaseBanner);

  if (activePhaseBanner == null) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      data-testid="phase-banner-overlay"
      aria-label={`Phase: ${formatPhaseDisplayName(activePhaseBanner)}`}
      role="status"
    >
      <p className={styles.label}>{formatPhaseDisplayName(activePhaseBanner)}</p>
    </div>
  );
}
