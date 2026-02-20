import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { createSessionStore } from './session/session-store.js';
import { findBootstrapDescriptorById, useActiveGameRuntime } from './session/active-game-runtime.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';
import { GameContainer } from './ui/GameContainer.js';
import { GameSelectionScreen } from './ui/GameSelectionScreen.js';
import { UnsavedChangesDialog } from './ui/UnsavedChangesDialog.js';
import { PreGameConfigPlaceholder } from './ui/screens/PreGameConfigPlaceholder.js';
import { ReplayPlaceholder } from './ui/screens/ReplayPlaceholder.js';

export function App(): ReactElement {
  const sessionStoreRef = useRef(createSessionStore());
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const sessionStore = sessionStoreRef.current;
  const sessionState = useStore(sessionStore, (state) => state.sessionState);
  const unsavedChanges = useStore(sessionStore, (state) => state.unsavedChanges);
  const activeRuntime = useActiveGameRuntime(sessionState);

  useEffect(() => {
    if (sessionState.screen !== 'activeGame') {
      setQuitDialogOpen(false);
    }
  }, [sessionState.screen]);
  const content = (() => {
    switch (sessionState.screen) {
      case 'gameSelection':
        return (
          <GameSelectionScreen
            onSelectGame={(gameId) => {
              sessionStore.getState().selectGame(gameId);
            }}
          />
        );
      case 'preGameConfig': {
        const descriptor = findBootstrapDescriptorById(sessionState.gameId);
        return (
          <PreGameConfigPlaceholder
            gameId={sessionState.gameId}
            descriptor={descriptor}
            onStartGame={(seed, playerId) => {
              sessionStore.getState().startGame(
                seed,
                [{ playerId, type: 'human' }],
              );
            }}
            onBack={() => {
              sessionStore.getState().returnToMenu();
            }}
          />
        );
      }
      case 'activeGame':
        if (activeRuntime === null) {
          return (
            <main data-testid="active-game-loading-screen">
              <h1>Loading Game</h1>
            </main>
          );
        }
        return (
          <>
            <GameContainer
              store={activeRuntime.store}
              visualConfigProvider={activeRuntime.visualConfigProvider}
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
      case 'replay':
        return (
          <ReplayPlaceholder
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
