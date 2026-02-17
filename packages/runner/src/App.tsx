import { assertValidatedGameDefInput, asPlayerId } from '@ludoforge/engine/runtime';
import { type ReactElement, useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand';

import { createGameBridge, type GameBridgeHandle } from './bridge/game-bridge.js';
import defaultBootstrapGameDef from './bootstrap/default-game-def.json';
import { createGameStore, type GameStore } from './store/game-store.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';
import { GameContainer } from './ui/GameContainer.js';

interface AppBootstrap {
  readonly bridgeHandle: GameBridgeHandle;
  readonly store: StoreApi<GameStore>;
}

const DEFAULT_BOOTSTRAP_SEED = 42;
const DEFAULT_BOOTSTRAP_PLAYER_ID = asPlayerId(0);
const DEFAULT_BOOTSTRAP_GAME_DEF = assertValidatedGameDefInput(defaultBootstrapGameDef, 'runner bootstrap fixture');

export function App(): ReactElement {
  const bootstrapRef = useRef<AppBootstrap | null>(null);

  if (bootstrapRef.current === null) {
    const bridgeHandle = createGameBridge();
    const store = createGameStore(bridgeHandle.bridge);
    bootstrapRef.current = { bridgeHandle, store };
  }

  const { bridgeHandle, store } = bootstrapRef.current;

  useEffect(() => {
    void store.getState().initGame(
      DEFAULT_BOOTSTRAP_GAME_DEF,
      DEFAULT_BOOTSTRAP_SEED,
      DEFAULT_BOOTSTRAP_PLAYER_ID,
    );

    return () => {
      bridgeHandle.terminate();
    };
  }, [bridgeHandle, store]);

  return (
    <ErrorBoundary>
      <GameContainer store={store} />
    </ErrorBoundary>
  );
}
