import type {
  AttributeValue,
  ChooseNOptionResolution,
  DecisionKey,
  MoveParamValue,
  PlayerId,
  VictoryComponentId,
} from '@ludoforge/engine/runtime';
import type { ResolvedZoneVisual } from '../config/visual-config-provider.js';

export interface RenderVictoryStandingEntry {
  readonly seat: string;
  readonly score: number;
  readonly threshold: number;
  readonly rank: number;
  readonly components: readonly RenderComponentBreakdown[];
}

export interface RenderSpaceContribution {
  readonly spaceId: string;
  readonly displayName: string;
  readonly contribution: number;
  readonly factors: Readonly<Record<string, number>>;
}

export interface RenderComponentBreakdown {
  readonly componentId: VictoryComponentId;
  readonly aggregate: number;
  readonly spaces: readonly RenderSpaceContribution[];
}

export interface RenderRuntimeEligibleFaction {
  readonly seatId: string;
  readonly displayName: string;
  readonly factionId: string;
  readonly seatIndex: number;
}

export interface RenderChoiceContext {
  readonly actionDisplayName: string;
  readonly decisionLabel: string;
  readonly decisionPrompt: string | null;
  readonly decisionParamName: string;
  readonly boundsText: string | null;
  readonly iterationLabel: string | null;
  readonly iterationProgress: string | null;
}

export interface RenderSurfacePoint {
  readonly x: number;
  readonly y: number;
}

export type RenderTableOverlayNode =
  | {
      readonly key: string;
      readonly type: 'text';
      readonly text: string;
      readonly point: RenderSurfacePoint;
      readonly signature: string;
    }
  | {
      readonly key: string;
      readonly type: 'marker';
      readonly point: RenderSurfacePoint;
      readonly signature: string;
    };

export interface RenderShowdownCard {
  readonly id: string;
  readonly type: string;
  readonly faceUp: boolean;
  readonly properties: Readonly<Record<string, number | string | boolean>>;
}

export interface RenderShowdownPlayerEntry {
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly score: number;
  readonly holeCards: readonly RenderShowdownCard[];
}

export interface ShowdownSurfaceModel {
  readonly communityCards: readonly RenderShowdownCard[];
  readonly rankedPlayers: readonly RenderShowdownPlayerEntry[];
}

export interface RenderSurfaceModel {
  readonly tableOverlays: readonly RenderTableOverlayNode[];
  readonly showdown: ShowdownSurfaceModel | null;
}

export interface RenderModel {
  readonly zones: readonly RenderZone[];
  readonly adjacencies: readonly RenderAdjacency[];
  readonly tokens: readonly RenderToken[];
  readonly activeEffects: readonly RenderLastingEffect[];
  readonly players: readonly RenderPlayer[];
  readonly activePlayerID: PlayerId;
  readonly turnOrder: readonly PlayerId[];
  readonly turnOrderType: 'roundRobin' | 'fixedOrder' | 'cardDriven' | 'simultaneous';
  readonly simultaneousSubmitted: readonly PlayerId[];
  readonly interruptStack: readonly RenderInterruptFrame[];
  readonly isInInterrupt: boolean;
  readonly phaseName: string;
  readonly phaseDisplayName: string;
  readonly eventDecks: readonly RenderEventDeck[];
  readonly actionGroups: readonly RenderActionGroup[];
  readonly hiddenActionsByClass: ReadonlyMap<string, readonly RenderAction[]>;
  readonly choiceBreadcrumb: readonly RenderChoiceStep[];
  readonly choiceContext: RenderChoiceContext | null;
  readonly choiceUi: RenderChoiceUi;
  readonly moveEnumerationWarnings: readonly RenderWarning[];
  readonly runtimeEligible: readonly RenderRuntimeEligibleFaction[];
  readonly surfaces: RenderSurfaceModel;
  readonly victoryStandings: readonly RenderVictoryStandingEntry[] | null;
  readonly terminal: RenderTerminal | null;
}

export interface RenderZone {
  readonly id: string;
  readonly displayName: string;
  readonly ordering: 'stack' | 'queue' | 'set';
  readonly tokenIDs: readonly string[];
  readonly hiddenTokenCount: number;
  readonly markers: readonly RenderMarker[];
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly isSelectable: boolean;
  readonly isHighlighted: boolean;
  readonly ownerID: PlayerId | null;
  readonly category: string | null;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly visual: ResolvedZoneVisual;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RenderAdjacency {
  readonly from: string;
  readonly to: string;
  readonly category: string | null;
  readonly isHighlighted: boolean;
}

export interface RenderToken {
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

export interface RenderVariable {
  readonly name: string;
  readonly value: number | boolean;
  readonly displayName: string;
}

export interface RenderMarker {
  readonly id: string;
  readonly displayName: string;
  readonly state: string;
  readonly possibleStates: readonly string[];
}

export interface RenderLastingEffect {
  readonly id: string;
  readonly displayName: string;
  readonly attributes: readonly RenderLastingEffectAttribute[];
}

export interface RenderLastingEffectAttribute {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface RenderInterruptFrame {
  readonly phase: string;
  readonly resumePhase: string;
}

export interface RenderEligibilityEntry {
  readonly label: string;
  readonly factionId: string;
}

export interface RenderEventCard {
  readonly id: string;
  readonly title: string;
  readonly orderNumber: number | null;
  readonly eligibility: readonly RenderEligibilityEntry[] | null;
  readonly sideMode: 'single' | 'dual';
  readonly unshadedText: string | null;
  readonly shadedText: string | null;
}

export interface RenderEventDeck {
  readonly id: string;
  readonly displayName: string;
  readonly drawZoneId: string;
  readonly discardZoneId: string;
  readonly playedCard: RenderEventCard | null;
  readonly lookaheadCard: RenderEventCard | null;
  readonly deckSize: number;
  readonly discardSize: number;
}

export interface RenderPlayer {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly isHuman: boolean;
  readonly isActive: boolean;
  readonly isEliminated: boolean;
  readonly factionId: string | null;
}

export interface RenderActionGroup {
  readonly groupKey: string;
  readonly groupName: string;
  readonly actions: readonly RenderAction[];
}

export interface RenderAction {
  readonly actionId: string;
  readonly displayName: string;
  readonly isAvailable: boolean;
  readonly actionClass?: string;
}

export interface RenderChoiceStep {
  readonly decisionKey: DecisionKey;
  readonly name: string;
  readonly displayName: string;
  readonly chosenValueId: string;
  readonly chosenValue: MoveParamValue;
  readonly chosenDisplayName: string;
  readonly iterationGroupId: string | null;
  readonly iterationLabel: string | null;
}

export interface RenderChoiceOption {
  readonly choiceValueId: string;
  readonly value: MoveParamValue;
  readonly displayName: string;
  readonly target: RenderChoiceTarget;
  readonly legality: 'legal' | 'illegal' | 'unknown';
  readonly illegalReason: string | null;
  readonly resolution?: ChooseNOptionResolution;
}

export interface RenderChoiceTarget {
  readonly kind: 'zone' | 'token' | 'scalar';
  readonly entityId: string | null;
  readonly displaySource: 'zone' | 'token' | 'fallback';
}

export interface RenderChoiceDomain {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export type RenderChoiceUiInvalidReason =
  | 'PENDING_CHOICE_MISSING_ACTION'
  | 'PENDING_CHOICE_MISSING_PARTIAL_MOVE'
  | 'CONFIRM_READY_MISSING_ACTION'
  | 'CONFIRM_READY_MISSING_PARTIAL_MOVE'
  | 'ACTION_MOVE_MISMATCH';

export type RenderChoiceUi =
  | {
      readonly kind: 'none';
    }
  | {
      readonly kind: 'discreteOne';
      readonly decisionKey: DecisionKey;
      readonly options: readonly RenderChoiceOption[];
    }
  | {
      readonly kind: 'discreteMany';
      readonly decisionKey: DecisionKey;
      readonly options: readonly RenderChoiceOption[];
      readonly min: number | null;
      readonly max: number | null;
      readonly selectedChoiceValueIds: readonly string[];
      readonly canConfirm: boolean;
    }
  | {
      readonly kind: 'numeric';
      readonly decisionKey: DecisionKey;
      readonly domain: RenderChoiceDomain;
    }
  | {
      readonly kind: 'confirmReady';
    }
  | {
      readonly kind: 'invalid';
      readonly reason: RenderChoiceUiInvalidReason;
    };

export interface RenderWarning {
  readonly code: string;
  readonly message: string;
}

export type RenderTerminal =
  | {
      readonly type: 'win';
      readonly player: PlayerId;
      readonly message: string;
      readonly victory?: RenderVictoryMetadata;
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
      readonly ranking: readonly RenderPlayerScore[];
      readonly message: string;
    };

export interface RenderPlayerScore {
  readonly player: PlayerId;
  readonly score: number;
}

export interface RenderVictoryMetadata {
  readonly timing: string;
  readonly checkpointId: string;
  readonly winnerFaction: string;
  readonly ranking?: readonly RenderVictoryRankingEntry[];
}

export interface RenderVictoryRankingEntry {
  readonly faction: string;
  readonly margin: number;
  readonly rank: number;
  readonly tieBreakKey: string;
}
