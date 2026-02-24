import type { ConditionAST, EffectAST, OptionsQuery } from './types-ast.js';
import type { TurnFlowActionClass, TurnFlowDuration } from './types-turn-flow.js';

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
  readonly sequence: {
    readonly chain: string;
    readonly step: number;
  };
  readonly id?: string;
  readonly seat: string;
  readonly executeAsSeat?: string;
  readonly operationClass: TurnFlowActionClass;
  readonly actionIds?: readonly string[];
  readonly zoneFilter?: ConditionAST;
  readonly uses?: number;
}

export interface EventEligibilityOverrideTargetActive {
  readonly kind: 'active';
}

export interface EventEligibilityOverrideTargetSeat {
  readonly kind: 'seat';
  readonly seat: string;
}

export type EventEligibilityOverrideTarget =
  | EventEligibilityOverrideTargetActive
  | EventEligibilityOverrideTargetSeat;

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
  readonly seat: string;
  readonly count: number;
  readonly status?: Readonly<Record<string, string>>;
}

export interface ScenarioCardPlacement {
  readonly cardId: string;
  readonly zoneId: string;
  readonly count?: number;
}

export interface ScenarioDeckComposition {
  readonly materializationStrategy: string;
  readonly pileCount: number;
  readonly eventsPerPile: number;
  readonly coupsPerPile: number;
  readonly includedCardIds?: readonly string[];
  readonly excludedCardIds?: readonly string[];
  readonly includedCardTags?: readonly string[];
  readonly excludedCardTags?: readonly string[];
  readonly pileFilters?: readonly {
    readonly piles: readonly number[];
    readonly includedCardIds?: readonly string[];
    readonly excludedCardIds?: readonly string[];
    readonly includedCardTags?: readonly string[];
    readonly excludedCardTags?: readonly string[];
    readonly metadataEquals?: Readonly<Record<string, string | number | boolean>>;
  }[];
}

export interface ScenarioPayload {
  readonly mapAssetId?: string;
  readonly pieceCatalogAssetId?: string;
  readonly eventDeckAssetId?: string;
  readonly scenarioName?: string;
  readonly yearRange?: string;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly initialPlacements?: readonly ScenarioPiecePlacement[];
  readonly cardPlacements?: readonly ScenarioCardPlacement[];
  readonly initializations?: readonly (
    | { readonly trackId: string; readonly value: number }
    | { readonly var: string; readonly value: number | boolean }
    | { readonly markerId: string; readonly state: string }
    | { readonly spaceId: string; readonly markerId: string; readonly state: string }
  )[];
  readonly outOfPlay?: readonly { readonly pieceTypeId: string; readonly seat: string; readonly count: number }[];
  readonly seatPools?: readonly {
    readonly seat: string;
    readonly availableZoneId: string;
    readonly outOfPlayZoneId?: string;
  }[];
  readonly deckComposition?: ScenarioDeckComposition;
}
