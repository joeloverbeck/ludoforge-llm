import { type ReactElement, useCallback, useEffect, useState } from 'react';

import {
  deleteSavedGame,
  listSavedGames,
  loadGame,
  type SavedGameListItem,
} from '../persistence/save-manager.js';
import type { SavedGameRecord } from '../persistence/game-db.js';
import styles from './LoadGameDialog.module.css';

interface LoadGameDialogProps {
  readonly isOpen: boolean;
  readonly gameId?: string;
  readonly onResume: (record: SavedGameRecord) => void;
  readonly onReplay: (record: SavedGameRecord) => void;
  readonly onClose: () => void;
}

export function LoadGameDialog({ isOpen, gameId, onResume, onReplay, onClose }: LoadGameDialogProps): ReactElement | null {
  const [savedGames, setSavedGames] = useState<readonly SavedGameListItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setStatus('loading');
    setError(null);

    void listSavedGames(gameId)
      .then((rows) => {
        setSavedGames(rows);
        setStatus('ready');
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load saved games.');
        setStatus('error');
      });
  }, [gameId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    refresh();
  }, [isOpen, refresh]);

  if (!isOpen) {
    return null;
  }

  return (
    <section className={styles.backdrop} data-testid="load-game-dialog" aria-label="Load game dialog">
      <article className={styles.card}>
        <header className={styles.header}>
          <h2 className={styles.title}>Load Saved Game</h2>
          <button
            type="button"
            className={styles.closeButton}
            data-testid="load-game-close"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        {status === 'loading'
          ? <p className={styles.message}>Loading saved games...</p>
          : null}
        {status === 'error'
          ? <p className={styles.error} data-testid="load-game-error">{error}</p>
          : null}
        {status === 'ready' && savedGames.length === 0
          ? <p className={styles.message}>No saved games found.</p>
          : null}

        {status === 'ready' && savedGames.length > 0
          ? (
            <ul className={styles.list}>
              {savedGames.map((savedGame) => (
                <li key={savedGame.id} className={styles.row} data-testid={`load-game-row-${savedGame.id}`}>
                  <div className={styles.metaCol}>
                    <p className={styles.name}>{savedGame.displayName}</p>
                    <p className={styles.meta}>
                      {savedGame.gameName} | {formatTimestamp(savedGame.timestamp)} | {savedGame.moveCount} moves
                    </p>
                    {savedGame.isTerminal ? <p className={styles.terminalBadge}>Completed</p> : null}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={savedGame.isTerminal || pendingActionId !== null}
                      onClick={() => {
                        void (async () => {
                          setPendingActionId(savedGame.id);
                          try {
                            const record = await loadGame(savedGame.id);
                            if (record === undefined) {
                              setError('Save no longer exists. Refresh and try again.');
                              refresh();
                              return;
                            }
                            onResume(record);
                            onClose();
                          } finally {
                            setPendingActionId((current) => (current === savedGame.id ? null : current));
                          }
                        })();
                      }}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      disabled={pendingActionId !== null}
                      onClick={() => {
                        void (async () => {
                          setPendingActionId(savedGame.id);
                          try {
                            const record = await loadGame(savedGame.id);
                            if (record === undefined) {
                              setError('Save no longer exists. Refresh and try again.');
                              refresh();
                              return;
                            }
                            onReplay(record);
                            onClose();
                          } finally {
                            setPendingActionId((current) => (current === savedGame.id ? null : current));
                          }
                        })();
                      }}
                    >
                      Replay
                    </button>
                    <button
                      type="button"
                      disabled={pendingActionId !== null}
                      onClick={() => {
                        if (!globalThis.confirm(`Delete saved game "${savedGame.displayName}"?`)) {
                          return;
                        }

                        void (async () => {
                          setPendingActionId(savedGame.id);
                          try {
                            await deleteSavedGame(savedGame.id);
                            refresh();
                          } finally {
                            setPendingActionId((current) => (current === savedGame.id ? null : current));
                          }
                        })();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
          : null}
      </article>
    </section>
  );
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return 'Unknown time';
  }

  return new Date(timestamp).toLocaleString();
}
