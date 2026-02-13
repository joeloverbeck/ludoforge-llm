import type { TurnFlowDuration } from './types-turn-flow.js';

export interface EventCardTargetCardinalityExact {
  readonly n: number;
}

export interface EventCardTargetCardinalityRange {
  readonly min?: number;
  readonly max: number;
}

export type EventCardTargetCardinality = EventCardTargetCardinalityExact | EventCardTargetCardinalityRange;

export interface EventCardTargetDef {
  readonly id: string;
  readonly selector: Readonly<Record<string, unknown>>;
  readonly cardinality: EventCardTargetCardinality;
}

export interface EventCardLastingEffectDef {
  readonly id: string;
  readonly duration: TurnFlowDuration;
  readonly effect: Readonly<Record<string, unknown>>;
}

export interface EventCardBranchDef {
  readonly id: string;
  readonly order?: number;
  readonly effects?: readonly Readonly<Record<string, unknown>>[];
  readonly targets?: readonly EventCardTargetDef[];
  readonly lastingEffects?: readonly EventCardLastingEffectDef[];
}

export interface EventCardSideDef {
  readonly effects?: readonly Readonly<Record<string, unknown>>[];
  readonly branches?: readonly EventCardBranchDef[];
  readonly targets?: readonly EventCardTargetDef[];
  readonly lastingEffects?: readonly EventCardLastingEffectDef[];
}

export interface EventCardDef {
  readonly id: string;
  readonly title: string;
  readonly sideMode: 'single' | 'dual';
  readonly order?: number;
  readonly unshaded?: EventCardSideDef;
  readonly shaded?: EventCardSideDef;
}

export interface EventCardSetPayload {
  readonly cards: readonly EventCardDef[];
}

export interface ScenarioPiecePlacement {
  readonly spaceId: string;
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly count: number;
  readonly status?: Readonly<Record<string, string>>;
}

export interface ScenarioDeckComposition {
  readonly pileCount: number;
  readonly eventsPerPile: number;
  readonly coupsPerPile: number;
  readonly includedCardIds?: readonly string[];
  readonly excludedCardIds?: readonly string[];
}

export interface ScenarioPayload {
  readonly mapAssetId: string;
  readonly pieceCatalogAssetId: string;
  readonly eventCardSetAssetId?: string;
  readonly scenarioName: string;
  readonly yearRange: string;
  readonly initialPlacements?: readonly ScenarioPiecePlacement[];
  readonly initialTrackValues?: readonly { readonly trackId: string; readonly value: number }[];
  readonly initialMarkers?: readonly { readonly spaceId: string; readonly markerId: string; readonly state: string }[];
  readonly outOfPlay?: readonly { readonly pieceTypeId: string; readonly faction: string; readonly count: number }[];
  readonly deckComposition?: ScenarioDeckComposition;
  readonly startingLeader?: string;
  readonly leaderStack?: readonly string[];
  readonly startingCapabilities?: readonly { readonly capabilityId: string; readonly side: 'unshaded' | 'shaded' }[];
  readonly startingEligibility?: readonly { readonly faction: string; readonly eligible: boolean }[];
  readonly usPolicy?: 'jfk' | 'lbj' | 'nixon';
}
