import { type ReactElement, useEffect, useState } from 'react';

import { listBootstrapDescriptors } from '../bootstrap/bootstrap-registry.js';
import { listSavedGames, type SavedGameListItem } from '../persistence/save-manager.js';
import styles from './GameSelectionScreen.module.css';

interface GameSelectionScreenProps {
  readonly onSelectGame: (gameId: string) => void;
}

export function GameSelectionScreen({ onSelectGame }: GameSelectionScreenProps): ReactElement {
  const [savedGames, setSavedGames] = useState<readonly SavedGameListItem[]>([]);
  const [savedGamesStatus, setSavedGamesStatus] = useState<'loading' | 'ready'>('loading');
  const gameDescriptors = listBootstrapDescriptors().filter((descriptor) => descriptor.id !== 'default');

  useEffect(() => {
    let cancelled = false;

    void listSavedGames()
      .then((games) => {
        if (cancelled) {
          return;
        }
        setSavedGames(games);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setSavedGamesStatus('ready');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.screen} data-testid="game-selection-screen">
      <section className={styles.gamesSection} aria-labelledby="available-games-heading">
        <h1 id="available-games-heading">Choose a Game</h1>
        <ul className={styles.gameList}>
          {gameDescriptors.map((descriptor) => {
            const metadata = descriptor.gameMetadata;
            return (
              <li key={descriptor.id}>
                <button
                  type="button"
                  className={styles.gameCard}
                  data-testid={`select-game-${descriptor.id}`}
                  onClick={() => {
                    onSelectGame(descriptor.id);
                  }}
                >
                  <span className={styles.gameName}>{metadata.name}</span>
                  <span className={styles.gameDescription}>{metadata.description}</span>
                  <span className={styles.playerRange}>
                    Players: {metadata.playerMin}-{metadata.playerMax}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.savedSection} aria-labelledby="saved-games-heading">
        <h2 id="saved-games-heading">Saved Games</h2>
        {savedGamesStatus === 'loading'
          ? <p className={styles.savedEmpty}>Loading saved games...</p>
          : null}
        {savedGamesStatus === 'ready' && savedGames.length === 0
          ? <p className={styles.savedEmpty}>No saved games</p>
          : null}
        {savedGamesStatus === 'ready' && savedGames.length > 0
          ? (
            <ul className={styles.savedList}>
              {savedGames.map((savedGame) => (
                <li key={savedGame.id} className={styles.savedRow}>
                  <div>
                    <p className={styles.savedTitle}>{savedGame.displayName}</p>
                    <p className={styles.savedMeta}>
                      {savedGame.gameName} | {formatTimestamp(savedGame.timestamp)} | {savedGame.moveCount} moves
                    </p>
                  </div>
                  <div className={styles.savedActions}>
                    <button type="button" disabled>
                      Resume
                    </button>
                    <button type="button" disabled>
                      Replay
                    </button>
                    <button type="button" disabled>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
          : null}
      </section>
    </main>
  );
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return 'Unknown time';
  }

  return new Date(timestamp).toLocaleString();
}
