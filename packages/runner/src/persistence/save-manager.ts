export interface SavedGameListItem {
  readonly id: string;
  readonly displayName: string;
  readonly gameName: string;
  readonly timestamp: number;
  readonly moveCount: number;
}

export async function listSavedGames(): Promise<readonly SavedGameListItem[]> {
  return [];
}
