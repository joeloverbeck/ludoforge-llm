import { Suspense, lazy, type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { Move } from '@ludoforge/engine/runtime';

import type { BrowserBootstrapEntryRequest } from './bootstrap/browser-entry.js';
import { findBootstrapDescriptorById } from './bootstrap/bootstrap-registry.js';
import { deleteSavedGame, loadGame } from './persistence/save-manager.js';
import type { SavedGameRecord } from './persistence/game-db.js';
import { createSessionStore } from './session/session-store.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';
import { GameSelectionScreen } from './ui/GameSelectionScreen.js';

const ActiveGameRoute = lazy(async () => import('./routes/ActiveGameRoute.js').then((module) => ({ default: module.ActiveGameRoute })));
const PreGameConfigRoute = lazy(async () => import('./routes/PreGameConfigRoute.js').then((module) => ({ default: module.PreGameConfigRoute })));
const ReplayRoute = lazy(async () => import('./routes/ReplayRoute.js').then((module) => ({ default: module.ReplayRoute })));
const MapEditorRoute = lazy(async () => import('./routes/MapEditorRoute.js').then((module) => ({ default: module.MapEditorRoute })));

interface AppProps {
  readonly browserBootstrapEntry?: BrowserBootstrapEntryRequest | null;
}

export function App({ browserBootstrapEntry = null }: AppProps = {}): ReactElement {
  const sessionStoreRef = useRef(
    createSessionStore(
      browserBootstrapEntry === null
        ? undefined
        : {
          screen: 'preGameConfig',
          gameId: browserBootstrapEntry.gameId,
        },
    ),
  );
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const sessionStore = sessionStoreRef.current;
  const sessionState = useStore(sessionStore, (state) => state.sessionState);
  const unsavedChanges = useStore(sessionStore, (state) => state.unsavedChanges);
  const descriptor = 'gameId' in sessionState
    ? findBootstrapDescriptorById(sessionState.gameId)
    : null;
  const handleMoveApplied = useCallback((move: Move) => {
    sessionStore.getState().recordMove(move);
  }, [sessionStore]);

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
            onEditMap={(gameId) => {
              sessionStore.getState().openMapEditor(gameId);
            }}
            onResumeSavedGame={handleResumeSavedGame}
            onReplaySavedGame={handleReplaySavedGame}
            onDeleteSavedGame={handleDeleteSavedGame}
          />
        );
      case 'preGameConfig': {
        return (
          <PreGameConfigRoute
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
        return (
          <ActiveGameRoute
            sessionState={sessionState}
            sessionStore={sessionStore}
            unsavedChanges={unsavedChanges}
            saveDialogOpen={saveDialogOpen}
            loadDialogOpen={loadDialogOpen}
            quitDialogOpen={quitDialogOpen}
            setSaveDialogOpen={setSaveDialogOpen}
            setLoadDialogOpen={setLoadDialogOpen}
            setQuitDialogOpen={setQuitDialogOpen}
            descriptorName={descriptor?.gameMetadata.name ?? sessionState.gameId}
            onMoveApplied={handleMoveApplied}
            onResumeRecord={handleResumeRecord}
            onReplayRecord={handleReplayRecord}
          />
        );
      }
      case 'replay':
        return (
          <ReplayRoute
            sessionState={sessionState}
            onBackToMenu={() => {
              sessionStore.getState().returnToMenu();
            }}
          />
        );
      case 'mapEditor':
        return (
          <MapEditorRoute
            gameId={sessionState.gameId}
            onBack={() => {
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
      <Suspense fallback={<main data-testid="route-loading-screen"><h1>Loading Screen</h1></main>}>
        {content}
      </Suspense>
    </ErrorBoundary>
  );
}
