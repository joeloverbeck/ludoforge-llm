import { proxy, wrap, type Remote } from 'comlink';

import type { GameWorkerAPI } from '../worker/game-worker-api.js';

export { proxy };
export type { GameWorkerAPI } from '../worker/game-worker-api.js';

export type GameBridge = Remote<GameWorkerAPI>;

export interface BridgeFatalError {
  readonly message: string;
  readonly details?: unknown;
}

export interface GameBridgeHandle {
  readonly bridge: GameBridge;
  readonly onFatalError: (listener: (error: BridgeFatalError) => void) => () => void;
  readonly terminate: () => void;
}

export function createGameBridge(): GameBridgeHandle {
  const worker = new Worker(
    new URL('../worker/game-worker.ts', import.meta.url),
    { type: 'module' },
  );
  const fatalErrorListeners = new Set<(error: BridgeFatalError) => void>();
  let terminated = false;
  const publishFatalError = (error: BridgeFatalError): void => {
    if (terminated) {
      return;
    }
    for (const listener of fatalErrorListeners) {
      listener(error);
    }
  };
  worker.onerror = (event) => {
    publishFatalError({
      message: event.message || 'Worker startup failed.',
      ...(event.error === undefined ? {} : { details: event.error }),
    });
    event.preventDefault();
  };
  worker.onmessageerror = () => {
    publishFatalError({
      message: 'Worker message channel failure.',
    });
  };

  const bridge = wrap<GameWorkerAPI>(worker);
  return {
    bridge,
    onFatalError: (listener) => {
      fatalErrorListeners.add(listener);
      return () => {
        fatalErrorListeners.delete(listener);
      };
    },
    terminate: () => {
      terminated = true;
      fatalErrorListeners.clear();
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    },
  };
}
