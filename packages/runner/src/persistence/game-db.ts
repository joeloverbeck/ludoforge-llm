import Dexie, { type Table } from 'dexie';
import type { Move } from '@ludoforge/engine/runtime';

import type { PlayerSeatConfig } from '../session/session-types.js';

export interface SavedGameRecord {
  readonly id: string;
  readonly gameId: string;
  readonly gameName: string;
  readonly displayName: string;
  readonly timestamp: number;
  readonly seed: number;
  readonly moveHistory: readonly Move[];
  readonly playerConfig: readonly PlayerSeatConfig[];
  readonly playerId: number;
  readonly moveCount: number;
  readonly isTerminal: boolean;
}

export class RunnerPersistenceDatabase extends Dexie {
  readonly saves!: Table<SavedGameRecord, string>;

  constructor(databaseName = 'ludoforge-runner') {
    super(databaseName);
    this.version(1).stores({
      saves: '&id, gameId, timestamp',
    });
  }
}

export function createRunnerPersistenceDatabase(databaseName?: string): RunnerPersistenceDatabase {
  return new RunnerPersistenceDatabase(databaseName);
}

export const runnerPersistenceDatabase = createRunnerPersistenceDatabase();
