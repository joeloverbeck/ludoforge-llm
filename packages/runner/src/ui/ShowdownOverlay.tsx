import { useContext, useMemo, useState, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { PlayerId } from '@ludoforge/engine/runtime';
import type { RenderPlayer, RenderToken, RenderVariable, RenderZone } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { VisualConfigContext } from '../config/visual-config-context.js';
import { MiniCard } from './MiniCard.js';
import styles from './ShowdownOverlay.module.css';

interface ShowdownOverlayProps {
  readonly store: StoreApi<GameStore>;
}

interface ScoredPlayer {
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly score: number;
  readonly holeCards: readonly RenderToken[];
}

const EMPTY_ZONES: readonly RenderZone[] = [];
const EMPTY_TOKENS: readonly RenderToken[] = [];
const EMPTY_PLAYERS: readonly RenderPlayer[] = [];
const EMPTY_PLAYER_VARS: ReadonlyMap<PlayerId, readonly RenderVariable[]> = new Map();

function deriveShowdownData(
  zones: readonly RenderZone[],
  tokens: readonly RenderToken[],
  players: readonly RenderPlayer[],
  playerVars: ReadonlyMap<PlayerId, readonly RenderVariable[]>,
): { communityCards: readonly RenderToken[]; scoredPlayers: readonly ScoredPlayer[] } {
  const tokensById = new Map(tokens.map((t) => [t.id, t]));

  const communityCards: RenderToken[] = [];
  for (const zone of zones) {
    if (zone.visibility === 'public' && zone.id.startsWith('community:')) {
      for (const tokenId of zone.tokenIDs) {
        const token = tokensById.get(tokenId);
        if (token !== undefined) {
          communityCards.push(token);
        }
      }
    }
  }

  const scoredPlayers: ScoredPlayer[] = [];
  for (const player of players) {
    if (player.isEliminated) {
      continue;
    }
    const vars = playerVars.get(player.id) ?? [];
    const scoreVar = vars.find((v) => v.name === 'showdownScore');
    if (scoreVar === undefined || typeof scoreVar.value !== 'number' || scoreVar.value === 0) {
      continue;
    }

    const holeCards: RenderToken[] = [];
    for (const zone of zones) {
      if (zone.ownerID === player.id && zone.id.startsWith('hand:')) {
        for (const tokenId of zone.tokenIDs) {
          const token = tokensById.get(tokenId);
          if (token !== undefined) {
            holeCards.push(token);
          }
        }
      }
    }

    scoredPlayers.push({
      playerId: player.id,
      displayName: player.displayName,
      score: scoreVar.value,
      holeCards,
    });
  }

  scoredPlayers.sort((a, b) => b.score - a.score);
  return { communityCards, scoredPlayers };
}

export function ShowdownOverlay({ store }: ShowdownOverlayProps): ReactElement | null {
  const visualConfigProvider = useContext(VisualConfigContext);
  const phaseName = useStore(store, (s) => s.renderModel?.phaseName ?? '');
  const zones = useStore(store, (s) => s.renderModel?.zones ?? EMPTY_ZONES);
  const tokens = useStore(store, (s) => s.renderModel?.tokens ?? EMPTY_TOKENS);
  const players = useStore(store, (s) => s.renderModel?.players ?? EMPTY_PLAYERS);
  const playerVars = useStore(store, (s) => s.renderModel?.playerVars ?? EMPTY_PLAYER_VARS);

  const [dismissed, setDismissed] = useState(false);

  const { communityCards, scoredPlayers } = useMemo(
    () => deriveShowdownData(zones, tokens, players, playerVars),
    [zones, tokens, players, playerVars],
  );

  if (phaseName !== 'showdown' || scoredPlayers.length === 0 || dismissed) {
    return null;
  }

  return (
    <section className={styles.backdrop} data-testid="showdown-overlay" aria-label="Showdown results overlay">
      <article className={styles.card} data-testid="showdown-overlay-card">
        <h2 className={styles.title} data-testid="showdown-overlay-title">Showdown Results</h2>

        {communityCards.length > 0 && (
          <div className={styles.section} data-testid="showdown-community-cards">
            <h3 className={styles.sectionTitle}>Community Cards</h3>
            <div className={styles.cardRow}>
              {communityCards.map((token) => {
                const template = visualConfigProvider?.getCardTemplateForTokenType(token.type) ?? null;
                return template === null ? (
                  <span key={token.id} data-testid={`showdown-community-${token.id}`}>
                    {token.id}
                  </span>
                ) : (
                  <MiniCard key={token.id} token={token} template={template} />
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.section} data-testid="showdown-player-rankings">
          <h3 className={styles.sectionTitle}>Player Rankings</h3>
          <ol className={styles.playerList}>
            {scoredPlayers.map((sp, index) => (
              <li key={String(sp.playerId)} className={styles.playerEntry} data-testid={`showdown-player-${String(sp.playerId)}`}>
                <div className={styles.playerHeader}>
                  <span className={styles.playerRank}>#{index + 1}</span>
                  <span className={styles.playerName}>{sp.displayName}</span>
                  <span className={styles.playerScore}>Score: {sp.score}</span>
                </div>
                {sp.holeCards.length > 0 && (
                  <div className={styles.playerCards} data-testid={`showdown-cards-${String(sp.playerId)}`}>
                    {sp.holeCards.map((token) => {
                      const template = visualConfigProvider?.getCardTemplateForTokenType(token.type) ?? null;
                      return template === null ? (
                        <span key={token.id} data-testid={`showdown-hole-${token.id}`}>
                          {token.id}
                        </span>
                      ) : (
                        <MiniCard key={token.id} token={token} template={template} />
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.button}
            data-testid="showdown-overlay-continue"
            onClick={() => setDismissed(true)}
          >
            Continue
          </button>
        </div>
      </article>
    </section>
  );
}
