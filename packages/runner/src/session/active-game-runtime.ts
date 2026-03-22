import type { Move } from '@ludoforge/engine/runtime';
import { createTraceBus, type TraceBus } from '@ludoforge/engine/trace';
import { useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand';

import type { GameBridgeHandle } from '../bridge/game-bridge.js';
import { createGameBridge } from '../bridge/game-bridge.js';
import { resolveRuntimeBootstrap, type RuntimeBootstrapConfig } from '../bootstrap/runner-bootstrap.js';
import { createGameStore, type GameStore } from '../store/game-store.js';
import { createConsoleTraceSubscriber } from '../trace/console-trace-subscriber.js';
import type { SessionState } from './session-types.js';

export interface ActiveGameRuntime {
  readonly bridgeHandle: GameBridgeHandle;
  readonly store: StoreApi<GameStore>;
  readonly visualConfigProvider: RuntimeBootstrapConfig['visualConfigProvider'];
  readonly traceBus: TraceBus;
}

interface ActiveGameRuntimeOptions {
  readonly onMoveApplied?: (move: Move) => void;
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

    const bootstrapConfig = resolveRuntimeBootstrap(
      sessionState.gameId,
      sessionState.seed,
      sessionState.playerConfig,
    );
    if (bootstrapConfig === null) {
      throw new Error(`Unknown activeGame descriptor id: ${sessionState.gameId}`);
    }

    const bridgeHandle = createGameBridge();
    const traceBus = createTraceBus();

    const traceEnabled = import.meta.env.DEV;
    let unsubscribeTrace: (() => void) | undefined;
    if (traceEnabled) {
      unsubscribeTrace = traceBus.subscribe(createConsoleTraceSubscriber());
    }

    const storeOptions: { onMoveApplied?: (move: Move) => void; traceBus?: TraceBus } = {
      traceBus,
    };
    if (options?.onMoveApplied !== undefined) {
      storeOptions.onMoveApplied = options.onMoveApplied;
    }

    const store = createGameStore(
      bridgeHandle.bridge,
      bootstrapConfig.visualConfigProvider,
      storeOptions,
    );
    const nextRuntime: ActiveGameRuntime = {
      bridgeHandle,
      store,
      visualConfigProvider: bootstrapConfig.visualConfigProvider,
      traceBus,
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
      unsubscribeTrace?.();
      traceBus.unsubscribeAll();
      if (runtimeRef.current === nextRuntime) {
        runtimeRef.current = null;
        setRuntime(null);
      }
      bridgeHandle.terminate();
    };
  }, [sessionState, options?.onMoveApplied]);

  return runtime;
}
