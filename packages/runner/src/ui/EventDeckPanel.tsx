import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderEventDeck } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import styles from './EventDeckPanel.module.css';

interface EventDeckPanelProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_EVENT_DECKS: readonly RenderEventDeck[] = [];

export function EventDeckPanel({ store }: EventDeckPanelProps): ReactElement | null {
  const eventDecks = useStore(store, (state) => state.renderModel?.eventDecks ?? EMPTY_EVENT_DECKS);

  if (eventDecks.length === 0) {
    return null;
  }

  return (
    <section className={styles.container} data-testid="event-deck-panel" aria-label="Event deck status">
      {eventDecks.map((deck) => (
        <article key={deck.id} className={styles.deck} data-testid={`event-deck-${deck.id}`}>
          <p className={styles.deckLabel}>{deck.displayName}</p>
          <p className={styles.cardTitle} data-testid={`event-deck-current-card-${deck.id}`}>
            {deck.currentCardTitle ?? 'No card'}
          </p>
          <p className={styles.counts}>
            <span>Deck: {deck.deckSize}</span>
            <span>Discard: {deck.discardSize}</span>
          </p>
        </article>
      ))}
    </section>
  );
}
