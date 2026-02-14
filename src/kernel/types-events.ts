import type { ConditionAST, EffectAST, OptionsQuery } from './types-ast.js';
import type { TurnFlowDuration } from './types-turn-flow.js';

export interface EventTargetCardinalityExact {
  readonly n: number;
}

export interface EventTargetCardinalityRange {
  readonly min?: number;
  readonly max: number;
}

export type EventTargetCardinality = EventTargetCardinalityExact | EventTargetCardinalityRange;

export interface EventTargetDef {
  readonly id: string;
  readonly selector: OptionsQuery;
  readonly cardinality: EventTargetCardinality;
}

export interface EventLastingEffectDef {
  readonly id: string;
  readonly duration: TurnFlowDuration;
  readonly setupEffects: readonly EffectAST[];
  readonly teardownEffects?: readonly EffectAST[];
}

export interface EventFreeOperationGrantDef {
  readonly id?: string;
  readonly faction: string;
  readonly actionIds?: readonly string[];
  readonly zoneFilter?: ConditionAST;
  readonly uses?: number;
}

export interface EventEligibilityOverrideTargetActive {
  readonly kind: 'active';
}

export interface EventEligibilityOverrideTargetFaction {
  readonly kind: 'faction';
  readonly faction: string;
}

export type EventEligibilityOverrideTarget =
  | EventEligibilityOverrideTargetActive
  | EventEligibilityOverrideTargetFaction;

export interface EventEligibilityOverrideDef {
  readonly target: EventEligibilityOverrideTarget;
  readonly eligible: boolean;
  readonly windowId: string;
}

export interface EventBranchDef {
  readonly id: string;
  readonly order?: number;
  readonly freeOperationGrants?: readonly EventFreeOperationGrantDef[];
  readonly eligibilityOverrides?: readonly EventEligibilityOverrideDef[];
  readonly effects?: readonly EffectAST[];
  readonly targets?: readonly EventTargetDef[];
  readonly lastingEffects?: readonly EventLastingEffectDef[];
}

export interface EventSideDef {
  readonly text?: string;
  readonly freeOperationGrants?: readonly EventFreeOperationGrantDef[];
  readonly eligibilityOverrides?: readonly EventEligibilityOverrideDef[];
  readonly effects?: readonly EffectAST[];
  readonly branches?: readonly EventBranchDef[];
  readonly targets?: readonly EventTargetDef[];
  readonly lastingEffects?: readonly EventLastingEffectDef[];
}

export interface EventCardMetadata {
  readonly [key: string]: string | number | boolean | readonly string[];
}

export interface EventCardDef {
  readonly id: string;
  readonly title: string;
  readonly sideMode: 'single' | 'dual';
  readonly order?: number;
  readonly tags?: readonly string[];
  readonly metadata?: EventCardMetadata;
  readonly playCondition?: ConditionAST;
  readonly unshaded?: EventSideDef;
  readonly shaded?: EventSideDef;
}

export interface EventDeckDef {
  readonly id: string;
  readonly drawZone: string;
  readonly discardZone: string;
  readonly shuffleOnSetup?: boolean;
  readonly cards: readonly EventCardDef[];
}

export interface ActiveLastingEffect {
  readonly id: string;
  readonly sourceCardId: string;
  readonly side: 'unshaded' | 'shaded';
  readonly branchId?: string;
  readonly duration: TurnFlowDuration;
  readonly setupEffects: readonly EffectAST[];
  readonly teardownEffects?: readonly EffectAST[];
  readonly remainingTurnBoundaries?: number;
  readonly remainingRoundBoundaries?: number;
  readonly remainingCycleBoundaries?: number;
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
  readonly eventDeckAssetId?: string;
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
