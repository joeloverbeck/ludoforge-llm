import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderPlayer } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { buildFactionColorStyle } from './faction-color-style.js';
import styles from './AITurnOverlay.module.css';

interface AITurnOverlayProps {
  readonly store: StoreApi<GameStore>;
}

interface AITurnViewModel {
  readonly activePlayer: RenderPlayer;
  readonly players: readonly RenderPlayer[];
}

function deriveAiTurnViewModel(renderModel: GameStore['renderModel']): AITurnViewModel | null {
  if (renderModel === null) {
    return null;
  }

  const activePlayer = renderModel.players.find((player) => player.id === renderModel.activePlayerID);
  if (activePlayer === undefined || activePlayer.isHuman) {
    return null;
  }

  return {
    activePlayer,
    players: renderModel.players,
  };
}

export function AITurnOverlay({ store }: AITurnOverlayProps): ReactElement | null {
  const viewModel = useStore(store, (state) => deriveAiTurnViewModel(state.renderModel));
  const skipAiTurn = useStore(store, (state) => state.requestAiTurnSkip);

  if (viewModel === null) {
    return null;
  }

  return (
    <section
      className={styles.container}
      data-testid="ai-turn-overlay"
      aria-label="AI turn"
      style={buildFactionColorStyle(viewModel.activePlayer, viewModel.players)}
    >
      <div className={styles.heading}>
        <p className={styles.label}>AI Turn</p>
        <p className={styles.playerName} data-testid="ai-turn-player-name">{viewModel.activePlayer.displayName}</p>
      </div>

      <div className={styles.thinking} data-testid="ai-turn-indicator" aria-label="AI is thinking">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.skipButton}
          data-testid="ai-turn-skip"
          onClick={() => {
            skipAiTurn();
          }}
        >
          Skip
        </button>
      </div>
    </section>
  );
}
