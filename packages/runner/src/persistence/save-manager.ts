import {
  runnerPersistenceDatabase,
  type RunnerPersistenceDatabase,
  type SavedGameRecord,
} from './game-db.js';

export interface SavedGameListItem {
  readonly id: string;
  readonly gameId: string;
  readonly displayName: string;
  readonly gameName: string;
  readonly timestamp: number;
  readonly moveCount: number;
  readonly isTerminal: boolean;
}

interface SaveManagerOptions {
  readonly database?: RunnerPersistenceDatabase;
  readonly randomUUID?: () => string;
}

function resolveDatabase(options?: SaveManagerOptions): RunnerPersistenceDatabase {
  return options?.database ?? runnerPersistenceDatabase;
}

function resolveRandomUUID(options?: SaveManagerOptions): () => string {
  return options?.randomUUID ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
}

function toSavedGameListItem(record: SavedGameRecord): SavedGameListItem {
  return {
    id: record.id,
    gameId: record.gameId,
    displayName: record.displayName,
    gameName: record.gameName,
    timestamp: record.timestamp,
    moveCount: record.moveCount,
    isTerminal: record.isTerminal,
  };
}

export async function saveGame(
  record: Omit<SavedGameRecord, 'id'>,
  options?: SaveManagerOptions,
): Promise<string> {
  const id = resolveRandomUUID(options)();
  await resolveDatabase(options).saves.put({ ...record, id });
  return id;
}

export async function loadGame(id: string, options?: SaveManagerOptions): Promise<SavedGameRecord | undefined> {
  return resolveDatabase(options).saves.get(id);
}

export async function listSavedGames(gameId?: string, options?: SaveManagerOptions): Promise<readonly SavedGameListItem[]> {
  const database = resolveDatabase(options);
  const records = gameId === undefined
    ? await database.saves.orderBy('timestamp').reverse().toArray()
    : (await database.saves.where('gameId').equals(gameId).sortBy('timestamp')).reverse();

  return records.map(toSavedGameListItem);
}

export async function deleteSavedGame(id: string, options?: SaveManagerOptions): Promise<void> {
  await resolveDatabase(options).saves.delete(id);
}
