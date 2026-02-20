import { type ReactElement, useEffect, useState } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { ActiveGameState } from '../session/session-types.js';
import type { SessionStore } from '../session/session-store.js';
import { saveGame } from '../persistence/save-manager.js';
import type { GameStore } from '../store/game-store.js';
import styles from './SaveGameDialog.module.css';

interface SaveGameDialogProps {
  readonly isOpen: boolean;
  readonly gameName: string;
  readonly sessionState: ActiveGameState;
  readonly sessionStore: StoreApi<SessionStore>;
  readonly gameStore: StoreApi<GameStore>;
  readonly onSaved: () => void;
  readonly onClose: () => void;
}

export function SaveGameDialog({
  isOpen,
  gameName,
  sessionState,
  sessionStore,
  gameStore,
  onSaved,
  onClose,
}: SaveGameDialogProps): ReactElement | null {
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerId = useStore(gameStore, (state) => state.playerID);
  const isTerminal = useStore(gameStore, (state) => state.gameLifecycle === 'terminal');
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && playerId !== null && !isSaving;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setName('');
    setError(null);
    setIsSaving(false);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <section className={styles.backdrop} data-testid="save-game-dialog" aria-label="Save game dialog">
      <article className={styles.card}>
        <h2 className={styles.title}>Save Game</h2>
        <label className={styles.fieldLabel} htmlFor="save-game-name">Save Name</label>
        <input
          id="save-game-name"
          data-testid="save-game-name"
          className={styles.input}
          type="text"
          value={name}
          placeholder="My game"
          onChange={(event) => {
            setName(event.currentTarget.value);
            if (error !== null) {
              setError(null);
            }
          }}
        />
        {error === null
          ? null
          : <p className={styles.error} data-testid="save-game-error">{error}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            data-testid="save-game-cancel"
            disabled={isSaving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            data-testid="save-game-submit"
            disabled={!canSave}
            onClick={() => {
              if (trimmedName.length === 0) {
                setError('Save name is required.');
                return;
              }
              if (playerId === null) {
                setError('Game is still initializing.');
                return;
              }

              void (async () => {
                setIsSaving(true);
                try {
                  const moveHistory = sessionStore.getState().moveAccumulator;
                  await saveGame({
                    gameId: sessionState.gameId,
                    gameName,
                    displayName: trimmedName,
                    timestamp: Date.now(),
                    seed: sessionState.seed,
                    moveHistory,
                    playerConfig: sessionState.playerConfig,
                    playerId,
                    moveCount: moveHistory.length,
                    isTerminal,
                  });
                  onSaved();
                  onClose();
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : 'Save failed.');
                } finally {
                  setIsSaving(false);
                }
              })();
            }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </article>
    </section>
  );
}
