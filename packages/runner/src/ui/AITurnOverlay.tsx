import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { AnimationDetailLevel } from '../animation/animation-types.js';
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
  const speed = useStore(store, (state) => state.aiPlaybackSpeed);
  const detailLevel = useStore(store, (state) => state.aiPlaybackDetailLevel);
  const autoSkip = useStore(store, (state) => state.aiPlaybackAutoSkip);
  const setSpeed = useStore(store, (state) => state.setAiPlaybackSpeed);
  const setDetailLevel = useStore(store, (state) => state.setAiPlaybackDetailLevel);
  const setAutoSkip = useStore(store, (state) => state.setAiPlaybackAutoSkip);

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

        <div className={styles.speedGroup} role="group" aria-label="AI speed" data-testid="ai-turn-speed-controls">
          {(['1x', '2x', '4x'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={styles.speedButton}
              aria-pressed={speed === option}
              data-testid={`ai-speed-${option}`}
              onClick={() => {
                setSpeed(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <label>
          Detail
          <select
            data-testid="ai-detail-level"
            value={detailLevel}
            onChange={(event) => {
              setDetailLevel(event.currentTarget.value as AnimationDetailLevel);
            }}
          >
            <option value="full">Full</option>
            <option value="standard">Standard</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>

        <label>
          <input
            type="checkbox"
            data-testid="ai-auto-skip"
            checked={autoSkip}
            onChange={(event) => {
              setAutoSkip(event.currentTarget.checked);
            }}
          />
          Skip all
        </label>
      </div>
    </section>
  );
}
