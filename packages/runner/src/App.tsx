import { type ReactElement, useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand';

import { createGameBridge, type GameBridgeHandle } from './bridge/game-bridge.js';
import { resolveBootstrapConfig } from './bootstrap/resolve-bootstrap-config.js';
import { createGameStore, type GameStore } from './store/game-store.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';
import { GameContainer } from './ui/GameContainer.js';

interface AppBootstrap {
  readonly bridgeHandle: GameBridgeHandle;
  readonly store: StoreApi<GameStore>;
  readonly bootstrapConfig: ReturnType<typeof resolveBootstrapConfig>;
}

export function App(): ReactElement {
  const bootstrapRef = useRef<AppBootstrap | null>(null);
  const mountCountRef = useRef(0);

  if (bootstrapRef.current === null) {
    const bootstrapConfig = resolveBootstrapConfig();
    const bridgeHandle = createGameBridge();
    const store = createGameStore(bridgeHandle.bridge, bootstrapConfig.visualConfigProvider);
    bootstrapRef.current = {
      bridgeHandle,
      store,
      bootstrapConfig,
    };
  }

  const { bridgeHandle, store, bootstrapConfig } = bootstrapRef.current;

  useEffect(() => {
    mountCountRef.current += 1;
    let cancelled = false;
    void (async () => {
      const gameDef = await bootstrapConfig.resolveGameDef();
      if (cancelled) {
        return;
      }
      await store.getState().initGame(
        gameDef,
        bootstrapConfig.seed,
        bootstrapConfig.playerId,
      );
    })().catch((error) => {
      if (cancelled) {
        return;
      }
      store.getState().reportBootstrapFailure(error);
    });

    return () => {
      cancelled = true;
      mountCountRef.current -= 1;
      queueMicrotask(() => {
        if (mountCountRef.current === 0) {
          bridgeHandle.terminate();
        }
      });
    };
  }, [bootstrapConfig, bridgeHandle, store]);

  return (
    <ErrorBoundary>
      <GameContainer store={store} visualConfigProvider={bootstrapConfig.visualConfigProvider} />
    </ErrorBoundary>
  );
}
