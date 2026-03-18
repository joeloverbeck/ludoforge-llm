import { Fragment, useCallback, type PointerEvent, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderEventCard, RenderEventDeck } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import styles from './EventDeckPanel.module.css';
import { buildFactionColorValue } from './faction-color-style.js';

interface EventDeckPanelProps {
  readonly store: StoreApi<GameStore>;
  readonly onCardHoverStart?: (card: RenderEventCard, element: HTMLElement) => void;
  readonly onCardHoverEnd?: () => void;
}

interface CardWidgetProps {
  readonly label: string;
  readonly card: RenderEventCard | null;
  readonly testId: string;
  readonly onPointerEnter?: ((card: RenderEventCard, element: HTMLElement) => void) | undefined;
  readonly onPointerLeave?: (() => void) | undefined;
}

function CardWidget({ label, card, testId, onPointerEnter, onPointerLeave }: CardWidgetProps): ReactElement {
  const handlePointerEnter = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (card !== null && onPointerEnter !== undefined) {
      onPointerEnter(card, e.currentTarget);
    }
  }, [card, onPointerEnter]);

  return (
    <div
      className={styles.cardWidget}
      data-testid={testId}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardTitle} data-testid={`${testId}-title`}>
        {card === null ? 'No card' : card.title}
      </span>
      {card !== null && card.orderNumber !== null && (
        <span className={styles.cardNumber} data-testid={`${testId}-number`}>
          #{card.orderNumber}
        </span>
      )}
      {card?.eligibility != null && card.eligibility.length > 0 && (
        <span className={styles.eligibility} data-testid={`${testId}-eligibility`}>
          {card.eligibility.map((entry, i) => (
            <Fragment key={entry.factionId}>
              {i > 0 && <span className={styles.eligibilitySeparator}> · </span>}
              <span style={{ color: buildFactionColorValue(entry.factionId, i) }}>
                {entry.label}
              </span>
            </Fragment>
          ))}
        </span>
      )}
    </div>
  );
}

const EMPTY_EVENT_DECKS: readonly RenderEventDeck[] = [];

export function EventDeckPanel({ store, onCardHoverStart, onCardHoverEnd }: EventDeckPanelProps): ReactElement | null {
  const eventDecks = useStore(store, (state) => state.renderModel?.eventDecks ?? EMPTY_EVENT_DECKS);

  if (eventDecks.length === 0) {
    return null;
  }

  return (
    <section className={styles.container} data-testid="event-deck-panel" aria-label="Event deck status">
      {eventDecks.map((deck) => (
        <article key={deck.id} className={styles.deck} data-testid={`event-deck-${deck.id}`}>
          <p className={styles.deckLabel}>{deck.displayName}</p>
          <div className={styles.cardPair}>
            <CardWidget
              label="Now Playing"
              card={deck.playedCard}
              testId={`event-deck-played-${deck.id}`}
              onPointerEnter={onCardHoverStart}
              onPointerLeave={onCardHoverEnd}
            />
            <CardWidget
              label="Up Next"
              card={deck.lookaheadCard}
              testId={`event-deck-lookahead-${deck.id}`}
              onPointerEnter={onCardHoverStart}
              onPointerLeave={onCardHoverEnd}
            />
          </div>
          <p className={styles.counts}>
            <span>Deck: {deck.deckSize}</span>
            <span>Discard: {deck.discardSize}</span>
          </p>
        </article>
      ))}
    </section>
  );
}
