import { asPlayerId } from '@ludoforge/engine/runtime';
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

function resolveHumanPlayerId(
  playerConfig: ActiveGameState['playerConfig'],
  fallback: number,
): number {
  const humanSeat = playerConfig.find((seat) => seat.type === 'human');
  return humanSeat?.playerId ?? fallback;
}

export function findBootstrapDescriptorById(gameId: string): BootstrapDescriptor | null {
  return listBootstrapDescriptors().find((descriptor) => descriptor.id === gameId) ?? null;
}

export function listNonDefaultBootstrapDescriptors(): readonly BootstrapDescriptor[] {
  return listBootstrapDescriptors().filter((descriptor) => descriptor.id !== 'default');
}

function buildActiveGameBootstrapSearch(state: ActiveGameState, descriptor: BootstrapDescriptor): string {
  const humanPlayerId = resolveHumanPlayerId(state.playerConfig, descriptor.defaultPlayerId);
  return `?game=${encodeURIComponent(descriptor.queryValue)}&seed=${String(state.seed)}&player=${String(humanPlayerId)}`;
}

export function useActiveGameRuntime(sessionState: SessionState): ActiveGameRuntime | null {
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
    const store = createGameStore(bridgeHandle.bridge, bootstrapConfig.visualConfigProvider);
    const nextRuntime: ActiveGameRuntime = {
      bridgeHandle,
      store,
      visualConfigProvider: bootstrapConfig.visualConfigProvider,
    };
    runtimeRef.current = nextRuntime;
    setRuntime(nextRuntime);

    let cancelled = false;
    void (async () => {
      const gameDef = await bootstrapConfig.resolveGameDef();
      if (cancelled) {
        return;
      }
      const humanPlayerId = resolveHumanPlayerId(sessionState.playerConfig, descriptor.defaultPlayerId);
      await store.getState().initGame(gameDef, sessionState.seed, asPlayerId(humanPlayerId));
    })().catch((error) => {
      if (cancelled) {
        return;
      }
      store.getState().reportBootstrapFailure(error);
    });

    return () => {
      cancelled = true;
      if (runtimeRef.current === nextRuntime) {
        runtimeRef.current = null;
        setRuntime(null);
      }
      bridgeHandle.terminate();
    };
  }, [sessionState]);

  return runtime;
}
