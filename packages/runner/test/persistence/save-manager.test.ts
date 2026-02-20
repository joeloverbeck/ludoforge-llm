import 'fake-indexeddb/auto';

import { asActionId, type Move } from '@ludoforge/engine/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createRunnerPersistenceDatabase,
  type RunnerPersistenceDatabase,
  type SavedGameRecord,
} from '../../src/persistence/game-db.js';
import { deleteSavedGame, listSavedGames, loadGame, saveGame } from '../../src/persistence/save-manager.js';

const MOVE_A: Move = {
  actionId: asActionId('move-a'),
  params: {},
};

const MOVE_B: Move = {
  actionId: asActionId('move-b'),
  params: { target: 'zone-1' },
};

let database: RunnerPersistenceDatabase;

beforeEach(() => {
  database = createRunnerPersistenceDatabase(`runner-persistence-test-${globalThis.crypto.randomUUID()}`);
});

afterEach(async () => {
  database.close();
  await database.delete();
});

function createBaseRecord(overrides: Partial<Omit<SavedGameRecord, 'id'>> = {}): Omit<SavedGameRecord, 'id'> {
  return {
    gameId: 'fitl',
    gameName: 'Fire in the Lake',
    displayName: 'Campaign Night',
    timestamp: 1_735_689_600_000,
    seed: 42,
    moveHistory: [MOVE_A, MOVE_B],
    playerConfig: [
      { playerId: 0, type: 'human' },
      { playerId: 1, type: 'ai-random' },
    ],
    playerId: 0,
    moveCount: 2,
    isTerminal: false,
    ...overrides,
  };
}

describe('save-manager', () => {
  it('saveGame creates a record that loadGame can retrieve', async () => {
    const record = createBaseRecord();
    const id = await saveGame(record, { database, randomUUID: () => 'save-1' });

    expect(id).toBe('save-1');
    await expect(loadGame(id, { database })).resolves.toEqual({
      id: 'save-1',
      ...record,
    });
  });

  it('loadGame returns undefined for missing ids', async () => {
    await expect(loadGame('missing-save-id', { database })).resolves.toBeUndefined();
  });

  it('listSavedGames returns all saves', async () => {
    await saveGame(createBaseRecord({ displayName: 'First' }), { database, randomUUID: () => 'save-1' });
    await saveGame(createBaseRecord({ displayName: 'Second', timestamp: 1_735_689_700_000 }), {
      database,
      randomUUID: () => 'save-2',
    });
    await saveGame(createBaseRecord({ displayName: 'Third', timestamp: 1_735_689_800_000 }), {
      database,
      randomUUID: () => 'save-3',
    });

    const saves = await listSavedGames(undefined, { database });

    expect(saves).toHaveLength(3);
    expect(saves.map((save) => save.id)).toEqual(['save-3', 'save-2', 'save-1']);
  });

  it('listSavedGames filters by gameId', async () => {
    await saveGame(createBaseRecord({ gameId: 'fitl' }), { database, randomUUID: () => 'save-fitl-1' });
    await saveGame(createBaseRecord({ gameId: 'fitl', timestamp: 2 }), { database, randomUUID: () => 'save-fitl-2' });
    await saveGame(createBaseRecord({ gameId: 'texas', gameName: "Texas Hold'em", timestamp: 3 }), {
      database,
      randomUUID: () => 'save-texas-1',
    });

    const fitlSaves = await listSavedGames('fitl', { database });

    expect(fitlSaves).toHaveLength(2);
    expect(fitlSaves.every((save) => save.gameId === 'fitl')).toBe(true);
  });

  it('listSavedGames returns timestamp-desc order', async () => {
    await saveGame(createBaseRecord({ timestamp: 100 }), { database, randomUUID: () => 'save-older' });
    await saveGame(createBaseRecord({ timestamp: 200 }), { database, randomUUID: () => 'save-newer' });

    const saves = await listSavedGames(undefined, { database });

    expect(saves.map((save) => save.id)).toEqual(['save-newer', 'save-older']);
  });

  it('deleteSavedGame removes records', async () => {
    const id = await saveGame(createBaseRecord(), { database, randomUUID: () => 'save-delete' });

    await deleteSavedGame(id, { database });

    await expect(loadGame(id, { database })).resolves.toBeUndefined();
  });

  it('round-trips safe-integer seed values', async () => {
    const record = createBaseRecord({ seed: Number.MAX_SAFE_INTEGER });
    const id = await saveGame(record, { database, randomUUID: () => 'save-seed' });

    const loaded = await loadGame(id, { database });

    expect(loaded?.seed).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('listSavedGames returns projection rows without move payloads', async () => {
    await saveGame(createBaseRecord(), { database, randomUUID: () => 'save-summary' });

    const [summary] = await listSavedGames(undefined, { database });
    expect(summary).toBeDefined();
    const definedSummary = summary!;

    expect(definedSummary).toMatchObject({
      id: 'save-summary',
      displayName: 'Campaign Night',
      gameName: 'Fire in the Lake',
      moveCount: 2,
      isTerminal: false,
    });
    expect('moveHistory' in definedSummary).toBe(false);
    expect('playerConfig' in definedSummary).toBe(false);
  });
});
