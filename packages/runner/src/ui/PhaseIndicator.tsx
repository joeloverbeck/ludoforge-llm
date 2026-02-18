import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import { buildFactionColorStyle } from './faction-color-style.js';
import styles from './PhaseIndicator.module.css';

interface PhaseIndicatorProps {
  readonly store: StoreApi<GameStore>;
}

function resolvePhaseLabel(renderModel: NonNullable<GameStore['renderModel']>): string {
  const displayName = renderModel.phaseDisplayName.trim();
  return displayName.length > 0 ? displayName : renderModel.phaseName;
}

export function PhaseIndicator({ store }: PhaseIndicatorProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);

  if (renderModel === null) {
    return null;
  }

  const phaseLabel = resolvePhaseLabel(renderModel);
  const activePlayer = renderModel.players.find((player) => player.id === renderModel.activePlayerID) ?? null;

  return (
    <section className={styles.container} data-testid="phase-indicator" aria-label="Current phase and active player">
      <p className={styles.phaseLabel} data-testid="phase-indicator-phase">{phaseLabel}</p>
      <p
        className={styles.activePlayer}
        data-testid="phase-indicator-active-player"
        style={activePlayer === null ? undefined : buildFactionColorStyle(activePlayer, renderModel.players)}
      >
        {activePlayer?.displayName ?? 'Unknown Player'}
      </p>
    </section>
  );
}
