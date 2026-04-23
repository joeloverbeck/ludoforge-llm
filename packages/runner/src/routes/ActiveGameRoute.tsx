import type { ReactElement } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';

import type { ActiveGameState } from '../session/session-types.js';
import type { SessionStore } from '../session/session-store.js';
import { useActiveGameRuntime } from '../session/active-game-runtime.js';
import type { SavedGameRecord } from '../persistence/game-db.js';
import { GameContainer } from '../ui/GameContainer.js';
import { LoadGameDialog } from '../ui/LoadGameDialog.js';
import { SaveGameDialog } from '../ui/SaveGameDialog.js';
import { UnsavedChangesDialog } from '../ui/UnsavedChangesDialog.js';

interface ActiveGameRouteProps {
  readonly sessionState: ActiveGameState;
  readonly sessionStore: UseBoundStore<StoreApi<SessionStore>>;
  readonly unsavedChanges: boolean;
  readonly saveDialogOpen: boolean;
  readonly loadDialogOpen: boolean;
  readonly quitDialogOpen: boolean;
  readonly setSaveDialogOpen: (open: boolean) => void;
  readonly setLoadDialogOpen: (open: boolean) => void;
  readonly setQuitDialogOpen: (open: boolean) => void;
  readonly descriptorName: string;
  readonly onMoveApplied: (move: import('@ludoforge/engine/runtime').Move) => void;
  readonly onResumeRecord: (record: SavedGameRecord) => void;
  readonly onReplayRecord: (record: SavedGameRecord) => void;
}

export function ActiveGameRoute({
  sessionState,
  sessionStore,
  unsavedChanges,
  saveDialogOpen,
  loadDialogOpen,
  quitDialogOpen,
  setSaveDialogOpen,
  setLoadDialogOpen,
  setQuitDialogOpen,
  descriptorName,
  onMoveApplied,
  onResumeRecord,
  onReplayRecord,
}: ActiveGameRouteProps): ReactElement {
  const activeRuntime = useActiveGameRuntime(sessionState, {
    onMoveApplied,
  });

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
        bridge={activeRuntime.bridgeHandle.bridge}
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
        gameName={descriptorName}
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
        onResume={onResumeRecord}
        onReplay={onReplayRecord}
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
