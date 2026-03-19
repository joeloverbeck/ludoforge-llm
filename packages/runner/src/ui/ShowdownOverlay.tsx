import { useContext, useEffect, useState, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { ShowdownSurfaceModel } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { VisualConfigContext } from '../config/visual-config-context.js';
import { MiniCard } from './MiniCard.js';
import styles from './ShowdownOverlay.module.css';

interface ShowdownOverlayProps {
  readonly store: StoreApi<GameStore>;
}

const SHOWDOWN_SIGNATURE_EMPTY = 'empty';

function showdownSignature(surface: ShowdownSurfaceModel | null): string {
  if (surface === null) {
    return SHOWDOWN_SIGNATURE_EMPTY;
  }

  return [
    surface.communityCards.map((card) => card.id).join(','),
    surface.rankedPlayers.map((player) => `${player.playerId}:${player.score}:${player.holeCards.map((card) => card.id).join(',')}`).join('|'),
  ].join('::');
}

function buildMiniCardToken(
  card: ShowdownSurfaceModel['communityCards'][number],
  ownerID: ShowdownSurfaceModel['rankedPlayers'][number]['playerId'] | null,
) {
  return {
    id: card.id,
    type: card.type,
    zoneID: '',
    ownerID,
    factionId: null,
    faceUp: card.faceUp,
    properties: card.properties,
    isSelectable: false,
    isSelected: false,
  } as const;
}

export function ShowdownOverlay({ store }: ShowdownOverlayProps): ReactElement | null {
  const visualConfigProvider = useContext(VisualConfigContext);
  const showdown = useStore(store, (s) => s.renderModel?.surfaces.showdown ?? null);
  const [dismissed, setDismissed] = useState(false);
  const signature = showdownSignature(showdown);

  useEffect(() => {
    setDismissed(false);
  }, [signature]);

  if (showdown === null || showdown.rankedPlayers.length === 0 || dismissed) {
    return null;
  }

  const communityCards = showdown.communityCards;

  return (
    <section className={styles.backdrop} data-testid="showdown-overlay" aria-label="Showdown results overlay">
      <article className={styles.card} data-testid="showdown-overlay-card">
        <h2 className={styles.title} data-testid="showdown-overlay-title">Showdown Results</h2>

        {communityCards.length > 0 && (
          <div className={styles.section} data-testid="showdown-community-cards">
            <h3 className={styles.sectionTitle}>Community Cards</h3>
            <div className={styles.cardRow}>
              {showdown.communityCards.map((card) => {
                const template = visualConfigProvider?.getCardTemplateForTokenType(card.type) ?? null;
                return template === null ? (
                  <span key={card.id} data-testid={`showdown-community-${card.id}`}>
                    {card.id}
                  </span>
                ) : (
                  <MiniCard key={card.id} token={buildMiniCardToken(card, null)} template={template} />
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.section} data-testid="showdown-player-rankings">
          <h3 className={styles.sectionTitle}>Player Rankings</h3>
          <ol className={styles.playerList}>
            {showdown.rankedPlayers.map((sp, index) => (
              <li key={String(sp.playerId)} className={styles.playerEntry} data-testid={`showdown-player-${String(sp.playerId)}`}>
                <div className={styles.playerHeader}>
                  <span className={styles.playerRank}>#{index + 1}</span>
                  <span className={styles.playerName}>{sp.displayName}</span>
                  <span className={styles.playerScore}>Score: {sp.score}</span>
                </div>
                {sp.holeCards.length > 0 && (
                  <div className={styles.playerCards} data-testid={`showdown-cards-${String(sp.playerId)}`}>
                    {sp.holeCards.map((card) => {
                      const template = visualConfigProvider?.getCardTemplateForTokenType(card.type) ?? null;
                      return template === null ? (
                        <span key={card.id} data-testid={`showdown-hole-${card.id}`}>
                          {card.id}
                        </span>
                      ) : (
                        <MiniCard key={card.id} token={buildMiniCardToken(card, sp.playerId)} template={template} />
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
