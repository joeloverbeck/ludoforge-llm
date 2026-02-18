import type { ReactElement } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { GameCanvas } from '../canvas/GameCanvas.js';
import type { GameStore } from '../store/game-store.js';
import { ActionToolbar } from './ActionToolbar.js';
import { ChoicePanel } from './ChoicePanel.js';
import { ErrorState } from './ErrorState.js';
import { LoadingState } from './LoadingState.js';
import { UndoControl } from './UndoControl.js';
import { UIOverlay } from './UIOverlay.js';
import { deriveBottomBarState } from './bottom-bar-mode.js';
import styles from './GameContainer.module.css';

interface GameContainerProps {
  readonly store: StoreApi<GameStore>;
}

export function GameContainer({ store }: GameContainerProps): ReactElement {
  const gameLifecycle = useStore(store, (state) => state.gameLifecycle);
  const error = useStore(store, (state) => state.error);
  const renderModel = useStore(store, (state) => state.renderModel);

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

  const bottomBarState = deriveBottomBarState(renderModel);
  const bottomBarContent = (() => {
    switch (bottomBarState.kind) {
      case 'actions':
        return (
          <>
            <ActionToolbar store={store} />
            <UndoControl store={store} />
          </>
        );
      case 'choicePending':
      case 'choiceConfirm':
      case 'choiceInvalid':
        return <ChoicePanel store={store} mode={bottomBarState.kind} />;
      case 'aiTurn':
      case 'hidden':
        return null;
      default:
        return null;
    }
  })();

  return (
    <div className={styles.container}>
      <div className={styles.canvasLayer}>
        <GameCanvas store={store} />
      </div>
      <UIOverlay
        bottomBarContent={bottomBarContent}
      />
    </div>
  );
}
