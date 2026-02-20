import { type ReactElement, type ReactNode } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type {
  RenderPlayer,
  RenderPlayerScore,
  RenderVictoryRankingEntry,
} from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { buildFactionColorStyle } from './faction-color-style.js';
import styles from './TerminalOverlay.module.css';

interface TerminalOverlayProps {
  readonly store: StoreApi<GameStore>;
  readonly onNewGame?: () => void;
  readonly onReturnToMenu?: () => void;
}

const EMPTY_PLAYERS: readonly RenderPlayer[] = [];

function resolvePlayerName(playerID: RenderPlayerScore['player'], players: readonly RenderPlayer[]): string {
  const player = players.find((candidate) => candidate.id === playerID);
  return player?.displayName ?? `Player ${String(playerID)}`;
}

function renderVictoryRanking(ranking: readonly RenderVictoryRankingEntry[]): ReactNode {
  if (ranking.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} data-testid="terminal-overlay-victory-ranking">
      <h3 className={styles.sectionTitle}>Victory Ranking</h3>
      <ol className={styles.list}>
        {ranking.map((entry) => (
          <li key={`${entry.rank}-${entry.faction}`} className={styles.listRow} data-testid="terminal-overlay-victory-ranking-entry">
            <span className={styles.rank}>#{entry.rank}</span>
            <span>{entry.faction}</span>
            <span className={styles.meta}>Margin {entry.margin}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function renderScoreRanking(ranking: readonly RenderPlayerScore[], players: readonly RenderPlayer[]): ReactNode {
  if (ranking.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} data-testid="terminal-overlay-score-ranking">
      <h3 className={styles.sectionTitle}>Final Scores</h3>
      <ol className={styles.list}>
        {ranking.map((entry, index) => (
          <li key={`${entry.player}-${entry.score}-${index}`} className={styles.listRow} data-testid="terminal-overlay-score-entry">
            <span className={styles.rank}>#{index + 1}</span>
            <span>{resolvePlayerName(entry.player, players)}</span>
            <span className={styles.meta}>{entry.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function renderTerminalBody(terminal: NonNullable<GameStore['renderModel']>['terminal'], players: readonly RenderPlayer[]): ReactNode {
  if (terminal === null) {
    return null;
  }

  switch (terminal.type) {
    case 'win': {
      const winner = players.find((player) => player.id === terminal.player) ?? null;
      const winnerName = resolvePlayerName(terminal.player, players);

      return (
        <>
          <h2 className={styles.title} data-testid="terminal-overlay-title">Victory</h2>
          <p
            className={styles.winner}
            data-testid="terminal-overlay-winner"
            style={winner === null ? undefined : buildFactionColorStyle(winner, players)}
          >
            {winnerName}
          </p>
          <p className={styles.message} data-testid="terminal-overlay-message">{terminal.message}</p>
          {terminal.victory?.ranking === undefined ? null : renderVictoryRanking(terminal.victory.ranking)}
        </>
      );
    }
    case 'draw':
      return (
        <>
          <h2 className={styles.title} data-testid="terminal-overlay-title">Draw</h2>
          <p className={styles.message} data-testid="terminal-overlay-message">{terminal.message}</p>
        </>
      );
    case 'score':
      return (
        <>
          <h2 className={styles.title} data-testid="terminal-overlay-title">Final Ranking</h2>
          <p className={styles.message} data-testid="terminal-overlay-message">{terminal.message}</p>
          {renderScoreRanking(terminal.ranking, players)}
        </>
      );
    case 'lossAll':
      return (
        <>
          <h2 className={styles.title} data-testid="terminal-overlay-title">Defeat</h2>
          <p className={styles.message} data-testid="terminal-overlay-message">{terminal.message}</p>
        </>
      );
  }
}

export function TerminalOverlay({ store, onNewGame, onReturnToMenu }: TerminalOverlayProps): ReactElement | null {
  const terminal = useStore(store, (state) => state.renderModel?.terminal ?? null);
  const players = useStore(store, (state) => state.renderModel?.players ?? EMPTY_PLAYERS);

  if (terminal === null) {
    return null;
  }

  const handleNewGame = onNewGame ?? (() => {});
  const handleReturnToMenu = onReturnToMenu ?? (() => {});

  return (
    <section className={styles.backdrop} data-testid="terminal-overlay" aria-label="Game result overlay">
      <article className={styles.card} data-testid="terminal-overlay-card">
        {renderTerminalBody(terminal, players)}
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.buttonSecondary}
            data-testid="terminal-overlay-return-menu"
            onClick={handleReturnToMenu}
          >
            Return to Menu
          </button>
          <button
            type="button"
            className={styles.button}
            data-testid="terminal-overlay-new-game"
            onClick={handleNewGame}
          >
            New Game
          </button>
        </div>
      </article>
    </section>
  );
}
