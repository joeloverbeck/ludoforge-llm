import { useEffect, useMemo, type ReactElement } from 'react';

import { createKeyboardCoordinator } from '../input/keyboard-coordinator.js';
import { isEditableTarget } from '../input/editable-target.js';
import type { ReplayRuntime } from '../session/replay-runtime.js';
import { GameContainer } from './GameContainer.js';
import { ReplayControls } from './ReplayControls.js';
import styles from './ReplayScreen.module.css';

interface ReplayScreenProps {
  readonly runtime: ReplayRuntime | null;
  readonly onBackToMenu: () => void;
}

const SPACE_KEYS = new Set([' ', 'Space', 'Spacebar']);

export function ReplayScreen({ runtime, onBackToMenu }: ReplayScreenProps): ReactElement {
  const keyboardCoordinator = useMemo(
    () => (typeof document === 'undefined' ? null : createKeyboardCoordinator(document)),
    [],
  );

  useEffect(() => {
    if (runtime === null || keyboardCoordinator === null) {
      return;
    }

    return keyboardCoordinator.register((event) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return false;
      }

      switch (event.key) {
        case 'ArrowLeft':
          void runtime.replayStore.getState().stepBackward();
          return true;
        case 'ArrowRight':
          void runtime.replayStore.getState().stepForward();
          return true;
        case 'Home':
          void runtime.replayStore.getState().jumpToMove(-1);
          return true;
        case 'End': {
          const maxMoveIndex = runtime.replayStore.getState().totalMoves - 1;
          void runtime.replayStore.getState().jumpToMove(Math.max(maxMoveIndex, -1));
          return true;
        }
        default:
          break;
      }

      if (SPACE_KEYS.has(event.key)) {
        if (runtime.replayStore.getState().isPlaying) {
          runtime.replayStore.getState().pause();
        } else {
          runtime.replayStore.getState().play();
        }
        return true;
      }

      return false;
    }, { priority: 25 });
  }, [keyboardCoordinator, runtime]);

  useEffect(() => {
    return () => {
      keyboardCoordinator?.destroy();
    };
  }, [keyboardCoordinator]);

  if (runtime === null) {
    return (
      <main className={styles.loading} data-testid="replay-screen-loading">
        <h1>Loading Replay</h1>
      </main>
    );
  }

  return (
    <main className={styles.screen} data-testid="replay-screen">
      <GameContainer
        store={runtime.store}
        visualConfigProvider={runtime.visualConfigProvider}
        readOnlyMode
      />
      <ReplayControls
        replayStore={runtime.replayStore}
        onBackToMenu={onBackToMenu}
      />
    </main>
  );
}
