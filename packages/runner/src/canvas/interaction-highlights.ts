export interface InteractionHighlights {
  readonly zoneIDs: readonly string[];
  readonly tokenIDs: readonly string[];
}

export const EMPTY_INTERACTION_HIGHLIGHTS: InteractionHighlights = {
  zoneIDs: [],
  tokenIDs: [],
};
