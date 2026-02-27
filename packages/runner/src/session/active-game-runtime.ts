import type { Move } from '@ludoforge/engine/runtime';
import { useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand';

import type { GameBridgeHandle } from '../bridge/game-bridge.js';
import { createGameBridge } from '../bridge/game-bridge.js';
import type { BootstrapDescriptor } from '../bootstrap/bootstrap-registry.js';
import { listBootstrapDescriptors } from '../bootstrap/bootstrap-registry.js';
import { resolveBootstrapConfig } from '../bootstrap/resolve-bootstrap-config.js';
import { createGameStore, type GameStore } from '../store/game-store.js';
import type { ActiveGameState, SessionState } from './session-types.js';

export interface ActiveGameRuntime {
  readonly bridgeHandle: GameBridgeHandle;
  readonly store: StoreApi<GameStore>;
  readonly visualConfigProvider: ReturnType<typeof resolveBootstrapConfig>['visualConfigProvider'];
}

interface ActiveGameRuntimeOptions {
  readonly onMoveApplied?: (move: Move) => void;
}

export function findBootstrapDescriptorById(gameId: string): BootstrapDescriptor | null {
  return listBootstrapDescriptors().find((descriptor) => descriptor.id === gameId) ?? null;
}

function buildActiveGameBootstrapSearch(state: ActiveGameState, descriptor: BootstrapDescriptor): string {
  const humanSeat = state.playerConfig.find((seat) => seat.type === 'human');
  const humanPlayerId = humanSeat?.playerId ?? descriptor.defaultPlayerId;
  return `?game=${encodeURIComponent(descriptor.queryValue)}&seed=${String(state.seed)}&player=${String(humanPlayerId)}`;
}

export function useActiveGameRuntime(
  sessionState: SessionState,
  options?: ActiveGameRuntimeOptions,
): ActiveGameRuntime | null {
  const runtimeRef = useRef<ActiveGameRuntime | null>(null);
  const [runtime, setRuntime] = useState<ActiveGameRuntime | null>(null);

  useEffect(() => {
    if (sessionState.screen !== 'activeGame') {
      const existingRuntime = runtimeRef.current;
      if (existingRuntime !== null) {
        runtimeRef.current = null;
        existingRuntime.bridgeHandle.terminate();
      }
      setRuntime(null);
      return;
    }

    const descriptor = findBootstrapDescriptorById(sessionState.gameId);
    if (descriptor === null) {
      throw new Error(`Unknown activeGame descriptor id: ${sessionState.gameId}`);
    }

    const search = buildActiveGameBootstrapSearch(sessionState, descriptor);
    const bootstrapConfig = resolveBootstrapConfig(search);
    const bridgeHandle = createGameBridge();
    const store = createGameStore(
      bridgeHandle.bridge,
      bootstrapConfig.visualConfigProvider,
      options?.onMoveApplied === undefined ? undefined : { onMoveApplied: options.onMoveApplied },
    );
    const nextRuntime: ActiveGameRuntime = {
      bridgeHandle,
      store,
      visualConfigProvider: bootstrapConfig.visualConfigProvider,
    };
    runtimeRef.current = nextRuntime;
    setRuntime(nextRuntime);

    let cancelled = false;
    const detachFatalErrorListener = bridgeHandle.onFatalError((error) => {
      if (cancelled) {
        return;
      }
      store.getState().reportBootstrapFailure(error);
    });
    void (async () => {
      const gameDef = await bootstrapConfig.resolveGameDef();
      if (cancelled) {
        return;
      }
      if (sessionState.initialMoveHistory.length > 0) {
        await store.getState().initGameFromHistory(
          gameDef,
          sessionState.seed,
          sessionState.playerConfig,
          sessionState.initialMoveHistory,
        );
        return;
      }
      await store.getState().initGame(gameDef, sessionState.seed, sessionState.playerConfig);
    })().catch((error) => {
      if (cancelled) {
        return;
      }
      store.getState().reportBootstrapFailure(error);
    });

    return () => {
      cancelled = true;
      detachFatalErrorListener();
      if (runtimeRef.current === nextRuntime) {
        runtimeRef.current = null;
        setRuntime(null);
      }
      bridgeHandle.terminate();
    };
  }, [sessionState, options?.onMoveApplied]);

  return runtime;
}
