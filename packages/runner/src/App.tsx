import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { Move } from '@ludoforge/engine/runtime';

import { deleteSavedGame, loadGame } from './persistence/save-manager.js';
import type { SavedGameRecord } from './persistence/game-db.js';
import { createSessionStore } from './session/session-store.js';
import { findBootstrapDescriptorById, useActiveGameRuntime } from './session/active-game-runtime.js';
import { useReplayRuntime } from './session/replay-runtime.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';
import { GameContainer } from './ui/GameContainer.js';
import { GameSelectionScreen } from './ui/GameSelectionScreen.js';
import { LoadGameDialog } from './ui/LoadGameDialog.js';
import { PreGameConfigScreen } from './ui/PreGameConfigScreen.js';
import { ReplayScreen } from './ui/ReplayScreen.js';
import { SaveGameDialog } from './ui/SaveGameDialog.js';
import { UnsavedChangesDialog } from './ui/UnsavedChangesDialog.js';

export function App(): ReactElement {
  const sessionStoreRef = useRef(createSessionStore());
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const sessionStore = sessionStoreRef.current;
  const sessionState = useStore(sessionStore, (state) => state.sessionState);
  const unsavedChanges = useStore(sessionStore, (state) => state.unsavedChanges);
  const handleMoveApplied = useCallback((move: Move) => {
    sessionStore.getState().recordMove(move);
  }, [sessionStore]);
  const activeRuntime = useActiveGameRuntime(sessionState, {
    onMoveApplied: handleMoveApplied,
  });
  const replayRuntime = useReplayRuntime(sessionState);

  useEffect(() => {
    if (sessionState.screen !== 'activeGame') {
      setQuitDialogOpen(false);
      setSaveDialogOpen(false);
      setLoadDialogOpen(false);
    }
  }, [sessionState.screen]);

  const handleResumeRecord = useCallback((record: SavedGameRecord): void => {
    if (record.isTerminal) {
      sessionStore.getState().startReplay(record.gameId, record.seed, record.moveHistory, record.playerConfig);
      return;
    }
    sessionStore.getState().resumeGame(record.gameId, record.seed, record.playerConfig, record.moveHistory);
  }, [sessionStore]);

  const handleReplayRecord = useCallback((record: SavedGameRecord): void => {
    sessionStore.getState().startReplay(record.gameId, record.seed, record.moveHistory, record.playerConfig);
  }, [sessionStore]);

  const handleResumeSavedGame = useCallback(async (saveId: string): Promise<void> => {
    const record = await loadGame(saveId);
    if (record === undefined) {
      return;
    }
    handleResumeRecord(record);
  }, [handleResumeRecord]);

  const handleReplaySavedGame = useCallback(async (saveId: string): Promise<void> => {
    const record = await loadGame(saveId);
    if (record === undefined) {
      return;
    }
    handleReplayRecord(record);
  }, [handleReplayRecord]);

  const handleDeleteSavedGame = useCallback(async (saveId: string): Promise<void> => {
    if (!globalThis.confirm('Delete this saved game?')) {
      return;
    }
    await deleteSavedGame(saveId);
  }, []);

  const content = (() => {
    switch (sessionState.screen) {
      case 'gameSelection':
        return (
          <GameSelectionScreen
            onSelectGame={(gameId) => {
              sessionStore.getState().selectGame(gameId);
            }}
            onResumeSavedGame={handleResumeSavedGame}
            onReplaySavedGame={handleReplaySavedGame}
            onDeleteSavedGame={handleDeleteSavedGame}
          />
        );
      case 'preGameConfig': {
        const descriptor = findBootstrapDescriptorById(sessionState.gameId);
        return (
          <PreGameConfigScreen
            gameId={sessionState.gameId}
            descriptor={descriptor}
            onStartGame={(seed, playerConfig) => {
              sessionStore.getState().startGame(seed, playerConfig);
            }}
            onBack={() => {
              sessionStore.getState().returnToMenu();
            }}
          />
        );
      }
      case 'activeGame': {
        if (activeRuntime === null) {
          return (
            <main data-testid="active-game-loading-screen">
              <h1>Loading Game</h1>
            </main>
          );
        }
        const descriptor = findBootstrapDescriptorById(sessionState.gameId);
        return (
          <>
            <GameContainer
              store={activeRuntime.store}
              visualConfigProvider={activeRuntime.visualConfigProvider}
              onSave={() => {
                setSaveDialogOpen(true);
              }}
              onLoad={() => {
                setLoadDialogOpen(true);
              }}
              onReturnToMenu={() => {
                sessionStore.getState().returnToMenu();
              }}
              onNewGame={() => {
                sessionStore.getState().newGame();
              }}
              onQuit={() => {
                if (unsavedChanges) {
                  setQuitDialogOpen(true);
                  return;
                }
                sessionStore.getState().returnToMenu();
              }}
            />
            <SaveGameDialog
              isOpen={saveDialogOpen}
              gameName={descriptor?.gameMetadata.name ?? sessionState.gameId}
              sessionState={sessionState}
              sessionStore={sessionStore}
              gameStore={activeRuntime.store}
              onSaved={() => {
                sessionStore.getState().markSaved();
              }}
              onClose={() => {
                setSaveDialogOpen(false);
              }}
            />
            <LoadGameDialog
              isOpen={loadDialogOpen}
              gameId={sessionState.gameId}
              onResume={(record) => {
                handleResumeRecord(record);
              }}
              onReplay={(record) => {
                handleReplayRecord(record);
              }}
              onClose={() => {
                setLoadDialogOpen(false);
              }}
            />
            <UnsavedChangesDialog
              isOpen={quitDialogOpen}
              onDiscard={() => {
                setQuitDialogOpen(false);
                sessionStore.getState().returnToMenu();
              }}
              onCancel={() => {
                setQuitDialogOpen(false);
              }}
            />
          </>
        );
      }
      case 'replay':
        return (
          <ReplayScreen
            runtime={replayRuntime}
            onBackToMenu={() => {
              sessionStore.getState().returnToMenu();
            }}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <ErrorBoundary>
      {content}
    </ErrorBoundary>
  );
}
