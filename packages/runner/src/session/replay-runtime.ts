import { useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand';

import { createGameBridge, type GameBridgeHandle } from '../bridge/game-bridge.js';
import { resolveBootstrapConfig } from '../bootstrap/resolve-bootstrap-config.js';
import { createReplayController, type ReplayController } from '../replay/replay-controller.js';
import { createReplayStore, type ReplayStore } from '../replay/replay-store.js';
import { createGameStore, type GameStore } from '../store/game-store.js';
import { findBootstrapDescriptorById } from './active-game-runtime.js';
import type { ReplayState, SessionState } from './session-types.js';

export interface ReplayRuntime {
  readonly bridgeHandle: GameBridgeHandle;
  readonly store: StoreApi<GameStore>;
  readonly replayStore: StoreApi<ReplayStore>;
  readonly visualConfigProvider: ReturnType<typeof resolveBootstrapConfig>['visualConfigProvider'];
}

function buildReplayBootstrapSearch(state: ReplayState): string {
  const descriptor = findBootstrapDescriptorById(state.gameId);
  if (descriptor === null) {
    throw new Error(`Unknown replay descriptor id: ${state.gameId}`);
  }

  const humanSeat = state.playerConfig.find((seat) => seat.type === 'human');
  const humanPlayerId = humanSeat?.playerId ?? descriptor.defaultPlayerId;
  return `?game=${encodeURIComponent(descriptor.queryValue)}&seed=${String(state.seed)}&player=${String(humanPlayerId)}`;
}

async function syncReplayProjection(runtime: ReplayRuntime, controller: ReplayController): Promise<void> {
  const [gameState, legalMoveResult, terminal] = await Promise.all([
    runtime.bridgeHandle.bridge.getState(),
    runtime.bridgeHandle.bridge.enumerateLegalMoves(),
    runtime.bridgeHandle.bridge.terminalResult(),
  ]);
  runtime.store.getState().hydrateFromReplayStep(
    gameState,
    legalMoveResult,
    terminal,
    controller.lastEffectTrace,
    controller.lastTriggerFirings,
  );
}

export function useReplayRuntime(sessionState: SessionState): ReplayRuntime | null {
  const runtimeRef = useRef<ReplayRuntime | null>(null);
  const [runtime, setRuntime] = useState<ReplayRuntime | null>(null);

  useEffect(() => {
    if (sessionState.screen !== 'replay') {
      setRuntime(null);
      return;
    }

    const replayState = sessionState;
    const search = buildReplayBootstrapSearch(replayState);
    const bootstrapConfig = resolveBootstrapConfig(search);
    const descriptor = findBootstrapDescriptorById(replayState.gameId);
    if (descriptor === null) {
      throw new Error(`Unknown replay descriptor id: ${replayState.gameId}`);
    }

    const bridgeHandle = createGameBridge();
    const store = createGameStore(bridgeHandle.bridge, bootstrapConfig.visualConfigProvider);

    let cancelled = false;
    const detachFatalErrorListener = bridgeHandle.onFatalError((error) => {
      if (cancelled) {
        return;
      }
      store.getState().reportBootstrapFailure(error);
    });
    let teardownController: (() => void) | null = null;
    let syncQueue: Promise<void> = Promise.resolve();

    void (async () => {
      const gameDef = await bootstrapConfig.resolveGameDef();
      if (cancelled) {
        return;
      }

      await store.getState().initGame(gameDef, replayState.seed, replayState.playerConfig);
      if (cancelled) {
        return;
      }

      let replayStore: StoreApi<ReplayStore> | null = null;
      const controller = createReplayController(
        bridgeHandle.bridge,
        gameDef,
        replayState.seed,
        replayState.moveHistory,
        () => {
          if (cancelled || replayStore === null) {
            return;
          }

          replayStore.getState().syncFromController();
          syncQueue = syncQueue
            .then(async () => {
              if (cancelled || runtimeRef.current === null) {
                return;
              }
              await syncReplayProjection(runtimeRef.current, controller);
            })
            .catch((error) => {
              if (cancelled) {
                return;
              }
              store.getState().reportBootstrapFailure(error);
            });
        },
      );

      replayStore = createReplayStore(controller);

      const nextRuntime: ReplayRuntime = {
        bridgeHandle,
        store,
        replayStore,
        visualConfigProvider: bootstrapConfig.visualConfigProvider,
      };
      runtimeRef.current = nextRuntime;
      setRuntime(nextRuntime);
      teardownController = () => {
        replayStore?.getState().destroy();
      };
    })().catch((error) => {
      if (cancelled) {
        return;
      }
      store.getState().reportBootstrapFailure(error);
    });

    return () => {
      cancelled = true;
      detachFatalErrorListener();
      teardownController?.();
      if (runtimeRef.current?.bridgeHandle === bridgeHandle) {
        runtimeRef.current = null;
      }
      setRuntime(null);
      bridgeHandle.terminate();
    };
  }, [sessionState]);

  return runtime;
}
