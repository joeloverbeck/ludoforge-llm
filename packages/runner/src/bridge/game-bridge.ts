import { proxy, wrap, type Remote } from 'comlink';

import type { GameWorkerAPI } from '../worker/game-worker-api.js';

export { proxy };
export type { GameWorkerAPI } from '../worker/game-worker-api.js';

export type GameBridge = Remote<GameWorkerAPI>;

export interface GameBridgeHandle {
  readonly bridge: GameBridge;
  readonly terminate: () => void;
}

export function createGameBridge(): GameBridgeHandle {
  const worker = new Worker(
    new URL('../worker/game-worker.ts', import.meta.url),
    { type: 'module' },
  );

  const bridge = wrap<GameWorkerAPI>(worker);
  return {
    bridge,
    terminate: () => worker.terminate(),
  };
}
