import { useMemo, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderToken, RenderZone } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { CollapsiblePanel } from './CollapsiblePanel.js';
import styles from './PlayerHandPanel.module.css';

interface PlayerHandPanelProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_ZONES: readonly RenderZone[] = [];
const EMPTY_TOKENS: readonly RenderToken[] = [];

function formatTokenProperties(properties: RenderToken['properties']): string {
  const entries = Object.entries(properties).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return 'No properties';
  }
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(', ');
}

function deriveHumanOwnedHandTokens(
  zones: readonly RenderZone[],
  tokens: readonly RenderToken[],
  humanPlayerId: NonNullable<NonNullable<GameStore['renderModel']>['players'][number]['id']> | null,
): readonly RenderToken[] {
  if (humanPlayerId === null) {
    return [];
  }

  const tokensById = new Map(tokens.map((token) => [token.id, token]));
  const handTokens: RenderToken[] = [];

  for (const zone of zones) {
    if (zone.visibility !== 'owner' || zone.ownerID !== humanPlayerId || zone.tokenIDs.length === 0) {
      continue;
    }

    for (const tokenId of zone.tokenIDs) {
      const token = tokensById.get(tokenId);
      if (token !== undefined) {
        handTokens.push(token);
      }
    }
  }

  return handTokens;
}

export function PlayerHandPanel({ store }: PlayerHandPanelProps): ReactElement | null {
  const zones = useStore(store, (state) => state.renderModel?.zones ?? EMPTY_ZONES);
  const tokens = useStore(store, (state) => state.renderModel?.tokens ?? EMPTY_TOKENS);
  const players = useStore(store, (state) => state.renderModel?.players ?? []);

  const humanPlayerId = useMemo(
    () => players.find((player) => player.isHuman)?.id ?? null,
    [players],
  );
  const handTokens = useMemo(
    () => deriveHumanOwnedHandTokens(zones, tokens, humanPlayerId),
    [zones, tokens, humanPlayerId],
  );

  if (handTokens.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <CollapsiblePanel
        title="Hand"
        panelTestId="player-hand-panel"
        toggleTestId="player-hand-panel-toggle"
        contentTestId="player-hand-panel-content"
      >
        <ul className={styles.tokenRow} data-testid="player-hand-token-row">
          {handTokens.map((token) => (
            <li
              key={token.id}
              className={token.isSelectable ? `${styles.tokenItem} ${styles.tokenSelectable}` : styles.tokenItem}
              data-testid={`player-hand-token-${token.id}`}
              aria-disabled={token.isSelectable ? undefined : 'true'}
            >
              <span className={styles.tokenType} data-testid={`player-hand-token-type-${token.id}`}>{token.type}</span>
              <span className={styles.tokenProperties} data-testid={`player-hand-token-properties-${token.id}`}>
                {formatTokenProperties(token.properties)}
              </span>
            </li>
          ))}
        </ul>
      </CollapsiblePanel>
    </div>
  );
}
