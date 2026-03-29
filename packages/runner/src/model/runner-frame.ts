import type {
  AttributeValue,
  ChooseNOptionResolution,
  DecisionKey,
  MoveParamValue,
  PlayerId,
  VictoryComponentId,
} from '@ludoforge/engine/runtime';

export interface RunnerVictoryStandingEntry {
  readonly seat: string;
  readonly score: number;
  readonly threshold: number;
  readonly rank: number;
  readonly components: readonly RunnerComponentBreakdown[];
}

export interface RunnerSpaceContribution {
  readonly spaceId: string;
  readonly contribution: number;
  readonly factors: Readonly<Record<string, number>>;
}

export interface RunnerComponentBreakdown {
  readonly componentId: VictoryComponentId;
  readonly aggregate: number;
  readonly spaces: readonly RunnerSpaceContribution[];
}

export interface RunnerRuntimeEligibleFaction {
  readonly seatId: string;
  readonly factionId: string;
  readonly seatIndex: number;
}

export interface RunnerChoiceContext {
  readonly selectedActionId: string;
  readonly decisionParamName: string;
  readonly minSelections: number | null;
  readonly maxSelections: number | null;
  readonly iterationEntityId: string | null;
  readonly iterationIndex: number | null;
  readonly iterationTotal: number | null;
}

export interface RunnerProjectionSource {
  readonly globalVars: readonly RunnerVariable[];
  readonly playerVars: ReadonlyMap<PlayerId, readonly RunnerVariable[]>;
}

export interface RunnerFrame {
  readonly zones: readonly RunnerZone[];
  readonly adjacencies: readonly RunnerAdjacency[];
  readonly tokens: readonly RunnerToken[];
  readonly activeEffects: readonly RunnerLastingEffect[];
  readonly players: readonly RunnerPlayer[];
  readonly activePlayerID: PlayerId;
  readonly turnOrder: readonly PlayerId[];
  readonly turnOrderType: 'roundRobin' | 'fixedOrder' | 'cardDriven' | 'simultaneous';
  readonly simultaneousSubmitted: readonly PlayerId[];
  readonly interruptStack: readonly RunnerInterruptFrame[];
  readonly isInInterrupt: boolean;
  readonly phaseName: string;
  readonly eventDecks: readonly RunnerEventDeck[];
  readonly actionGroups: readonly RunnerActionGroup[];
  readonly choiceBreadcrumb: readonly RunnerChoiceStep[];
  readonly choiceContext: RunnerChoiceContext | null;
  readonly choiceUi: RunnerChoiceUi;
  readonly moveEnumerationWarnings: readonly RunnerWarning[];
  readonly runtimeEligible: readonly RunnerRuntimeEligibleFaction[];
  readonly victoryStandings: readonly RunnerVictoryStandingEntry[] | null;
  readonly terminal: RunnerTerminal | null;
}

export interface RunnerProjectionBundle {
  readonly frame: RunnerFrame;
  readonly source: RunnerProjectionSource;
}

export interface RunnerZone {
  readonly id: string;
  readonly ordering: 'stack' | 'queue' | 'set';
  readonly tokenIDs: readonly string[];
  readonly hiddenTokenCount: number;
  readonly markers: readonly RunnerMarker[];
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly isSelectable: boolean;
  readonly isHighlighted: boolean;
  readonly ownerID: PlayerId | null;
  readonly category: string | null;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RunnerAdjacency {
  readonly from: string;
  readonly to: string;
  readonly category: string | null;
  readonly isHighlighted: boolean;
}

export interface RunnerToken {
  readonly id: string;
  readonly type: string;
  readonly zoneID: string;
  readonly ownerID: PlayerId | null;
  readonly factionId: string | null;
  readonly faceUp: boolean;
  readonly properties: Readonly<Record<string, number | string | boolean>>;
  readonly isSelectable: boolean;
  readonly isSelected: boolean;
}

export interface RunnerVariable {
  readonly name: string;
  readonly value: number | boolean;
}

export interface RunnerMarker {
  readonly id: string;
  readonly state: string;
  readonly possibleStates: readonly string[];
}

export interface RunnerLastingEffect {
  readonly id: string;
  readonly sourceCardId: string;
  readonly sourceCardTitle: string;
  readonly attributes: readonly RunnerLastingEffectAttribute[];
}

export interface RunnerLastingEffectAttribute {
  readonly key: string;
  readonly value: string;
}

export interface RunnerInterruptFrame {
  readonly phase: string;
  readonly resumePhase: string;
}

export interface RunnerEligibilityEntry {
  readonly label: string;
  readonly factionId: string;
}

export interface RunnerEventCard {
  readonly id: string;
  readonly title: string;
  readonly orderNumber: number | null;
  readonly eligibility: readonly RunnerEligibilityEntry[] | null;
  readonly sideMode: 'single' | 'dual';
  readonly unshadedText: string | null;
  readonly shadedText: string | null;
}

export interface RunnerEventDeck {
  readonly id: string;
  readonly drawZoneId: string;
  readonly discardZoneId: string;
  readonly playedCard: RunnerEventCard | null;
  readonly lookaheadCard: RunnerEventCard | null;
  readonly deckSize: number;
  readonly discardSize: number;
}

export interface RunnerPlayer {
  readonly id: PlayerId;
  readonly isHuman: boolean;
  readonly isActive: boolean;
  readonly isEliminated: boolean;
  readonly factionId: string | null;
}

export interface RunnerActionGroup {
  readonly groupKey: string;
  readonly actions: readonly RunnerAction[];
}

export interface RunnerAction {
  readonly actionId: string;
  readonly isAvailable: boolean;
  readonly actionClass?: string;
}

export interface RunnerChoiceStep {
  readonly decisionKey: DecisionKey;
  readonly name: string;
  readonly chosenValueId: string;
  readonly chosenValue: MoveParamValue;
  readonly iterationGroupId: string | null;
  readonly iterationEntityId: string | null;
}

export interface RunnerChoiceOption {
  readonly choiceValueId: string;
  readonly value: MoveParamValue;
  readonly target: RunnerChoiceTarget;
  readonly legality: 'legal' | 'illegal' | 'unknown';
  readonly illegalReason: string | null;
  readonly resolution?: ChooseNOptionResolution;
}

export interface RunnerChoiceTarget {
  readonly kind: 'zone' | 'token' | 'scalar';
  readonly entityId: string | null;
}

export interface RunnerChoiceDomain {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export type RunnerChoiceUiInvalidReason =
  | 'PENDING_CHOICE_MISSING_ACTION'
  | 'PENDING_CHOICE_MISSING_PARTIAL_MOVE'
  | 'CONFIRM_READY_MISSING_ACTION'
  | 'CONFIRM_READY_MISSING_PARTIAL_MOVE'
  | 'ACTION_MOVE_MISMATCH';

export type RunnerChoiceUi =
  | {
      readonly kind: 'none';
    }
  | {
      readonly kind: 'discreteOne';
      readonly decisionKey: DecisionKey;
      readonly options: readonly RunnerChoiceOption[];
    }
  | {
      readonly kind: 'discreteMany';
      readonly decisionKey: DecisionKey;
      readonly options: readonly RunnerChoiceOption[];
      readonly min: number | null;
      readonly max: number | null;
      readonly selectedChoiceValueIds: readonly string[];
      readonly canConfirm: boolean;
    }
  | {
      readonly kind: 'numeric';
      readonly decisionKey: DecisionKey;
      readonly domain: RunnerChoiceDomain;
    }
  | {
      readonly kind: 'confirmReady';
    }
  | {
      readonly kind: 'invalid';
      readonly reason: RunnerChoiceUiInvalidReason;
    };

export interface RunnerWarning {
  readonly code: string;
  readonly message: string;
}

export type RunnerTerminal =
  | {
      readonly type: 'win';
      readonly player: PlayerId;
      readonly message: string;
      readonly victory?: RunnerVictoryMetadata;
    }
  | {
      readonly type: 'lossAll';
      readonly message: string;
    }
  | {
      readonly type: 'draw';
      readonly message: string;
    }
  | {
      readonly type: 'score';
      readonly ranking: readonly RunnerPlayerScore[];
      readonly message: string;
    };

export interface RunnerPlayerScore {
  readonly player: PlayerId;
  readonly score: number;
}

export interface RunnerVictoryMetadata {
  readonly timing: string;
  readonly checkpointId: string;
  readonly winnerFaction: string;
  readonly ranking?: readonly RunnerVictoryRankingEntry[];
}

export interface RunnerVictoryRankingEntry {
  readonly faction: string;
  readonly margin: number;
  readonly rank: number;
  readonly tieBreakKey: string;
}
