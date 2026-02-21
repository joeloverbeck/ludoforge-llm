import type { StoreApi } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import { resolveAiPlaybackDelayMs } from '../store/ai-move-policy.js';
import type { AnimationDetailLevel } from './animation-types.js';

interface SelectorSubscribeStore<TState> extends StoreApi<TState> {
  subscribe: {
    (listener: (state: TState, previousState: TState) => void): () => void;
    <TSelected>(
      selector: (state: TState) => TSelected,
      listener: (selectedState: TSelected, previousSelectedState: TSelected) => void,
      options?: {
        readonly equalityFn?: (a: TSelected, b: TSelected) => boolean;
        readonly fireImmediately?: boolean;
      },
    ): () => void;
  };
}

interface AiPlaybackAnimationPort {
  setDetailLevel(level: AnimationDetailLevel): void;
  skipAll(): void;
}

export interface AiPlaybackController {
  start(): void;
  destroy(): void;
}

export interface AiPlaybackControllerOptions {
  readonly store: StoreApi<GameStore>;
  readonly animation: AiPlaybackAnimationPort;
  readonly baseStepDelayMs?: number;
  readonly drainTimeoutMs?: number;
  readonly maxNoOpRetries?: number;
  readonly maxDriveMoves?: number;
  readonly onError?: (message: string) => void;
}

export function createAiPlaybackController(options: AiPlaybackControllerOptions): AiPlaybackController {
  const selectorStore = options.store as SelectorSubscribeStore<GameStore>;
  const baseStepDelayMs = options.baseStepDelayMs ?? 500;
  const drainTimeoutMs = options.drainTimeoutMs ?? 10_000;
  const maxNoOpRetries = options.maxNoOpRetries ?? 10;
  const maxDriveMoves = options.maxDriveMoves ?? 512;

  const NO_OP_RETRY_DELAY_MS = 100;

  let destroyed = false;
  let started = false;
  let running = false;
  let pendingSkip = false;
  let skipToken = selectorStore.getState().aiSkipRequestToken;
  let currentDelayTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveDelayWait: (() => void) | null = null;
  let unsubscribeState: (() => void) | null = null;

  const clearDelayTimer = (): void => {
    if (currentDelayTimer !== null) {
      clearTimeout(currentDelayTimer);
      currentDelayTimer = null;
    }
    resolveDelayWait?.();
    resolveDelayWait = null;
  };

  const waitFor = (ms: number): Promise<void> => {
    if (ms <= 0 || destroyed) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      resolveDelayWait = resolve;
      currentDelayTimer = setTimeout(() => {
        currentDelayTimer = null;
        resolveDelayWait = null;
        resolve();
      }, ms);
    });
  };

  const waitForAnimationDrain = (): Promise<void> => {
    if (destroyed || !selectorStore.getState().animationPlaying) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          unsubscribe();
          options.animation.skipAll();
          resolve();
        }
      }, drainTimeoutMs);
      const unsubscribe = selectorStore.subscribe(
        (state) => state.animationPlaying,
        (playing, previousPlaying) => {
          if (settled || playing || !previousPlaying) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        },
      );
    });
  };

  const isAiTurn = (state: GameStore): boolean => {
    const renderModel = state.renderModel;
    if (renderModel === null || state.gameLifecycle === 'terminal') {
      return false;
    }
    const activePlayer = renderModel.players.find((player) => player.id === renderModel.activePlayerID);
    return activePlayer?.isHuman === false;
  };

  const driveAiTurn = async (): Promise<void> => {
    if (destroyed || running) {
      return;
    }

    running = true;
    try {
      let noOpCount = 0;
      let moveCount = 0;

      while (!destroyed) {
        const state = selectorStore.getState();
        if (!isAiTurn(state) || state.loading) {
          pendingSkip = false;
          return;
        }

        const shouldSkip = pendingSkip || state.aiPlaybackAutoSkip;
        const stepDelayMs = shouldSkip ? 0 : resolveAiPlaybackDelayMs(state.aiPlaybackSpeed, baseStepDelayMs);

        if (stepDelayMs > 0) {
          await waitFor(stepDelayMs);
          if (destroyed) {
            return;
          }
        }

        if (shouldSkip) {
          options.animation.skipAll();
        }

        const outcome = await selectorStore.getState().resolveAiStep();
        if (destroyed) {
          return;
        }

        if (outcome === 'advanced') {
          noOpCount = 0;
          moveCount += 1;

          if (moveCount >= maxDriveMoves) {
            options.onError?.(`AI playback exceeded move limit (${maxDriveMoves}).`);
            pendingSkip = false;
            return;
          }

          if (!shouldSkip) {
            await waitForAnimationDrain();
          }
          continue;
        }

        if (outcome === 'no-legal-moves') {
          options.onError?.('AI player has no legal moves. This may indicate a game specification issue.');
          pendingSkip = false;
          return;
        }

        if (outcome === 'no-op') {
          noOpCount += 1;
          if (noOpCount >= maxNoOpRetries) {
            options.onError?.('AI turn stalled after repeated no-op results.');
            pendingSkip = false;
            return;
          }
          await waitFor(NO_OP_RETRY_DELAY_MS);
          continue;
        }

        // 'human-turn', 'terminal', or any other outcome — exit normally
        pendingSkip = false;
        return;
      }
    } finally {
      running = false;
    }
  };

  const syncDetailLevel = (level: AnimationDetailLevel): void => {
    options.animation.setDetailLevel(level);
  };

  const maybeStart = (): void => {
    if (destroyed || running) {
      return;
    }
    const state = selectorStore.getState();
    if (!isAiTurn(state) || state.loading) {
      return;
    }
    void driveAiTurn();
  };

  const onStateChange = (): void => {
    if (destroyed) {
      return;
    }

    const state = selectorStore.getState();
    syncDetailLevel(state.aiPlaybackDetailLevel);

    if (state.aiSkipRequestToken !== skipToken) {
      skipToken = state.aiSkipRequestToken;
      pendingSkip = true;
      clearDelayTimer();
      options.animation.skipAll();
    }

    maybeStart();
  };

  return {
    start(): void {
      if (started || destroyed) {
        return;
      }
      started = true;

      syncDetailLevel(selectorStore.getState().aiPlaybackDetailLevel);
      unsubscribeState = selectorStore.subscribe(onStateChange);
      maybeStart();
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      started = false;
      clearDelayTimer();
      unsubscribeState?.();
      unsubscribeState = null;
    },
  };
}
