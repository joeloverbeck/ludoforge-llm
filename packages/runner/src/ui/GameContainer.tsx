import type { ReactElement } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { GameCanvas } from '../canvas/GameCanvas.js';
import type { GameStore } from '../store/game-store.js';
import { ErrorState } from './ErrorState.js';
import { LoadingState } from './LoadingState.js';
import { UIOverlay } from './UIOverlay.js';
import styles from './GameContainer.module.css';

interface GameContainerProps {
  readonly store: StoreApi<GameStore>;
}

export function GameContainer({ store }: GameContainerProps): ReactElement {
  const gameLifecycle = useStore(store, (state) => state.gameLifecycle);
  const error = useStore(store, (state) => state.error);

  if (error !== null) {
    return (
      <div className={styles.container}>
        <ErrorState error={error} onRetry={() => store.getState().clearError()} />
      </div>
    );
  }

  if (gameLifecycle === 'idle' || gameLifecycle === 'initializing') {
    return (
      <div className={styles.container}>
        <LoadingState />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.canvasLayer}>
        <GameCanvas store={store} />
      </div>
      <UIOverlay />
    </div>
  );
}
