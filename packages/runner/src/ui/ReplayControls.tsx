import { type ChangeEvent, type ReactElement } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import type { ReplayStore } from '../replay/replay-store.js';
import styles from './ReplayControls.module.css';

interface ReplayControlsProps {
  readonly replayStore: StoreApi<ReplayStore>;
  readonly onBackToMenu: () => void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

export function ReplayControls({ replayStore, onBackToMenu }: ReplayControlsProps): ReactElement {
  const currentMoveIndex = useStore(replayStore, (state) => state.currentMoveIndex);
  const totalMoves = useStore(replayStore, (state) => state.totalMoves);
  const isPlaying = useStore(replayStore, (state) => state.isPlaying);
  const playbackSpeed = useStore(replayStore, (state) => state.playbackSpeed);

  const maxMoveIndex = totalMoves - 1;
  const hasMoves = totalMoves > 0;
  const atStart = currentMoveIndex <= -1;
  const atEnd = !hasMoves || currentMoveIndex >= maxMoveIndex;
  const moveCounterText = currentMoveIndex < 0
    ? 'Initial State'
    : `Move ${String(currentMoveIndex + 1)} / ${String(totalMoves)}`;

  const onScrubberChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextIndex = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(nextIndex)) {
      return;
    }
    void replayStore.getState().jumpToMove(nextIndex);
  };

  return (
    <section className={styles.panel} data-testid="replay-controls">
      <div className={styles.summaryRow}>
        <div className={styles.moveCounter} data-testid="replay-move-counter">{moveCounterText}</div>
        <button
          type="button"
          className={styles.button}
          data-testid="replay-back-to-menu"
          onClick={onBackToMenu}
        >
          Back to Menu
        </button>
      </div>
      <input
        type="range"
        className={styles.slider}
        data-testid="replay-scrubber"
        min={-1}
        max={Math.max(maxMoveIndex, -1)}
        value={Math.max(Math.min(currentMoveIndex, Math.max(maxMoveIndex, -1)), -1)}
        onChange={onScrubberChange}
      />
      <div className={styles.controlsRow}>
        <button
          type="button"
          className={styles.button}
          data-testid="replay-jump-start"
          disabled={atStart}
          onClick={() => {
            void replayStore.getState().jumpToMove(-1);
          }}
        >
          |&lt;&lt;
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="replay-step-backward"
          disabled={atStart}
          onClick={() => {
            void replayStore.getState().stepBackward();
          }}
        >
          &lt;
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="replay-play-pause"
          disabled={!hasMoves || atEnd}
          onClick={() => {
            if (isPlaying) {
              replayStore.getState().pause();
              return;
            }
            replayStore.getState().play();
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="replay-step-forward"
          disabled={atEnd}
          onClick={() => {
            void replayStore.getState().stepForward();
          }}
        >
          &gt;
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="replay-jump-end"
          disabled={atEnd}
          onClick={() => {
            void replayStore.getState().jumpToMove(maxMoveIndex);
          }}
        >
          &gt;&gt;|
        </button>
        <div className={styles.speedRow}>
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`${styles.button} ${playbackSpeed === speed ? styles.speedButtonActive : ''}`.trim()}
              data-testid={`replay-speed-${String(speed).replace('.', '_')}`}
              onClick={() => {
                replayStore.getState().setSpeed(speed);
              }}
            >
              {`${String(speed)}x`}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
