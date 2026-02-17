import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import styles from './UndoControl.module.css';

interface UndoControlProps {
  readonly store: StoreApi<GameStore>;
}

function canRenderUndo(renderModel: GameStore['renderModel']): boolean {
  if (renderModel == null || renderModel.choiceType !== null) {
    return false;
  }

  const activePlayer = renderModel.players.find((player) => player.id === renderModel.activePlayerID);
  return activePlayer?.isHuman === true;
}

export function UndoControl({ store }: UndoControlProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);

  if (!canRenderUndo(renderModel)) {
    return null;
  }

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.undoButton}
        data-testid="undo-control"
        onClick={() => {
          void store.getState().undo();
        }}
      >
        Undo
      </button>
    </div>
  );
}
