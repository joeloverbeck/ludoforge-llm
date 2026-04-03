import { type ReactElement, useEffect, useState } from 'react';

import { listBootstrapDescriptors } from '../bootstrap/bootstrap-registry.js';
import { resolveRunnerBootstrapHandle } from '../bootstrap/runner-bootstrap.js';
import { listSavedGames, type SavedGameListItem } from '../persistence/save-manager.js';
import styles from './GameSelectionScreen.module.css';

interface GameSelectionScreenProps {
  readonly onSelectGame: (gameId: string) => void;
  readonly onEditMap?: (gameId: string) => void;
  readonly onResumeSavedGame?: (saveId: string) => void | Promise<void>;
  readonly onReplaySavedGame?: (saveId: string) => void | Promise<void>;
  readonly onDeleteSavedGame?: (saveId: string) => void | Promise<void>;
}

export function GameSelectionScreen({
  onSelectGame,
  onEditMap,
  onResumeSavedGame,
  onReplaySavedGame,
  onDeleteSavedGame,
}: GameSelectionScreenProps): ReactElement {
  const [savedGames, setSavedGames] = useState<readonly SavedGameListItem[]>([]);
  const [savedGamesStatus, setSavedGamesStatus] = useState<'loading' | 'ready'>('loading');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [mapEditorSupport, setMapEditorSupport] = useState<ReadonlyMap<string, boolean>>(new Map());
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

  useEffect(() => {
    let cancelled = false;

    void Promise.all(gameDescriptors.map(async (descriptor) => {
      try {
        const capabilities = await resolveRunnerBootstrapHandle(descriptor).resolveCapabilities();
        return [descriptor.id, capabilities.supportsMapEditor] as const;
      } catch {
        return [descriptor.id, false] as const;
      }
    })).then((entries) => {
      if (cancelled) {
        return;
      }
      setMapEditorSupport(new Map(entries));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.screen} data-testid="game-selection-screen">
      <section className={styles.hero} aria-labelledby="available-games-heading">
        <p className={styles.eyebrow}>Runner Shell</p>
        <h1 id="available-games-heading" className={styles.title}>Choose a Game</h1>
        <p className={styles.lead}>
          Launch a fresh table, inspect the available games, or continue a saved session from the runner shell.
        </p>
        <div className={styles.heroFacts}>
          <span className={styles.heroBadge}>{`${gameDescriptors.length} games ready`}</span>
          <span className={styles.heroBadge}>{formatSavedSummary(savedGamesStatus, savedGames.length)}</span>
          <span className={styles.heroBadge}>{formatMapWorkspaceSummary(mapEditorSupport)}</span>
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.gamesSection} aria-labelledby="game-library-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Game Library</p>
              <h2 id="game-library-heading" className={styles.sectionTitle}>Available Games</h2>
            </div>
            <p className={styles.sectionCopy}>
              Compare each table at a glance, then move straight into setup before the live surface loads.
            </p>
          </div>
          <ul className={styles.gameList}>
          {gameDescriptors.map((descriptor) => {
            const metadata = descriptor.gameMetadata;
            const supportsMapEditor = mapEditorSupport.get(descriptor.id) === true;
            return (
              <li key={descriptor.id} className={styles.gameCard}>
                <article className={styles.gameCardPanel}>
                  <div className={styles.gameCardBody}>
                    <div className={styles.gameCardHeader}>
                      <div>
                        <h3 className={styles.gameName}>{metadata.name}</h3>
                        <p className={styles.gameDescription}>{metadata.description}</p>
                      </div>
                      <div className={styles.metaGroup}>
                        <span className={styles.metaBadge}>{formatPlayerSummary(metadata.playerMin, metadata.playerMax)}</span>
                        {metadata.factionIds.length > 1
                          ? <span className={styles.metaBadge}>{formatFactionSummary(metadata.factionIds.length)}</span>
                          : null}
                      </div>
                    </div>
                  </div>
                  <div className={styles.gameActions}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      data-testid={`select-game-${descriptor.id}`}
                      onClick={() => {
                        onSelectGame(descriptor.id);
                      }}
                    >
                      Configure Game
                    </button>
                    {supportsMapEditor
                      ? (
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          data-testid={`edit-map-${descriptor.id}`}
                          onClick={() => {
                            onEditMap?.(descriptor.id);
                          }}
                          disabled={onEditMap === undefined}
                        >
                          Edit Map
                        </button>
                      )
                      : null}
                  </div>
                </article>
              </li>
            );
          })}
          </ul>
        </section>

        <section className={styles.savedSection} aria-labelledby="saved-games-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Continuity</p>
              <h2 id="saved-games-heading" className={styles.sectionTitle}>Saved Games</h2>
            </div>
            <p className={styles.sectionCopy}>
              Return to unfinished tables, revisit completed runs, or keep a replay-ready archive close at hand.
            </p>
          </div>
        {savedGamesStatus === 'loading'
          ? <p className={styles.savedEmpty}>Loading your saved sessions...</p>
          : null}
        {savedGamesStatus === 'ready' && savedGames.length === 0
          ? (
            <div className={styles.savedEmptyState}>
              <p className={styles.savedEmptyTitle}>No saved games yet</p>
              <p className={styles.savedEmpty}>
                Start a new game from the library above. Saved sessions and completed tables will appear here.
              </p>
            </div>
          )
          : null}
        {savedGamesStatus === 'ready' && savedGames.length > 0
          ? (
            <ul className={styles.savedList}>
              {savedGames.map((savedGame) => (
                <li key={savedGame.id} className={styles.savedRow}>
                  <div className={styles.savedBody}>
                    <div className={styles.savedHeader}>
                      <p className={styles.savedTitle}>{savedGame.displayName}</p>
                      {savedGame.isTerminal
                        ? <p className={styles.savedTerminal}>Completed</p>
                        : <p className={styles.savedLive}>In progress</p>}
                    </div>
                    <p className={styles.savedMeta}>{savedGame.gameName}</p>
                    <p className={styles.savedMeta}>
                      {formatTimestamp(savedGame.timestamp)} · {savedGame.moveCount} moves
                    </p>
                  </div>
                  <div className={styles.savedActions}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      onClick={() => {
                        void onResumeSavedGame?.(savedGame.id);
                      }}
                      disabled={savedGame.isTerminal || onResumeSavedGame === undefined}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => {
                        void onReplaySavedGame?.(savedGame.id);
                      }}
                      disabled={onReplaySavedGame === undefined}
                    >
                      Replay
                    </button>
                    <button
                      type="button"
                      className={styles.ghostAction}
                      disabled={onDeleteSavedGame === undefined || pendingDeleteId === savedGame.id}
                      onClick={() => {
                        void (async () => {
                          if (onDeleteSavedGame === undefined) {
                            return;
                          }
                          setPendingDeleteId(savedGame.id);
                          try {
                            await onDeleteSavedGame(savedGame.id);
                            setSavedGames((current) => current.filter((entry) => entry.id !== savedGame.id));
                          } finally {
                            setPendingDeleteId((current) => (current === savedGame.id ? null : current));
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
        </section>
      </div>
    </main>
  );
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return 'Unknown time';
  }

  return new Date(timestamp).toLocaleString();
}

function formatPlayerSummary(playerMin: number, playerMax: number): string {
  if (playerMin === playerMax) {
    return `${playerMin} players`;
  }

  return `${playerMin}-${playerMax} players`;
}

function formatFactionSummary(factionCount: number): string {
  if (factionCount === 1) {
    return '1 faction';
  }

  return `${factionCount} factions`;
}

function formatSavedSummary(status: 'loading' | 'ready', savedCount: number): string {
  if (status === 'loading') {
    return 'Scanning saved sessions';
  }

  if (savedCount === 0) {
    return 'No saved sessions yet';
  }

  return `${savedCount} saved session${savedCount === 1 ? '' : 's'}`;
}

function formatMapWorkspaceSummary(mapEditorSupport: ReadonlyMap<string, boolean>): string {
  const count = Array.from(mapEditorSupport.values()).filter(Boolean).length;
  if (count === 0) {
    return 'Map workspace on select titles';
  }

  return `${count} map workspace${count === 1 ? '' : 's'} ready`;
}
