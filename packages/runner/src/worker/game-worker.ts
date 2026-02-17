import { expose } from 'comlink';

import { createGameWorker } from './game-worker-api';

const gameWorker = createGameWorker();

export type {
  BridgeInitOptions,
  GameMetadata,
  GameWorkerAPI,
  WorkerError,
} from './game-worker-api.js';

expose(gameWorker);
