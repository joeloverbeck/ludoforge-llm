import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import { buildFactionColorStyle } from './faction-color-style.js';
import styles from './TurnOrderDisplay.module.css';

interface TurnOrderDisplayProps {
  readonly store: StoreApi<GameStore>;
}

function joinClassNames(classNames: readonly (string | null | undefined)[]): string {
  return classNames.filter((className): className is string => typeof className === 'string').join(' ');
}

export function TurnOrderDisplay({ store }: TurnOrderDisplayProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);

  if (renderModel === null) {
    return null;
  }

  const playersById = new Map(renderModel.players.map((player) => [player.id, player]));

  return (
    <section className={styles.container} data-testid="turn-order-display" aria-label="Turn order">
      <ol className={styles.list}>
        {renderModel.turnOrder.map((playerId) => {
          const player = playersById.get(playerId);
          if (player === undefined) {
            return null;
          }

          const isActive = player.id === renderModel.activePlayerID;
          const className = joinClassNames([
            styles.chip,
            isActive ? styles.active : null,
            player.isEliminated ? styles.eliminated : null,
          ]);

          return (
            <li
              key={String(player.id)}
              className={className}
              data-testid={`turn-order-player-${String(player.id)}`}
              style={buildFactionColorStyle(player, renderModel.players)}
            >
              {player.displayName}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
