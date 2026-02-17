import type { MoveParamValue, PlayerId } from '@ludoforge/engine';

export interface RenderModel {
  readonly zones: readonly RenderZone[];
  readonly adjacencies: readonly RenderAdjacency[];
  readonly mapSpaces: readonly RenderMapSpace[];
  readonly tokens: readonly RenderToken[];
  readonly globalVars: readonly RenderVariable[];
  readonly playerVars: ReadonlyMap<PlayerId, readonly RenderVariable[]>;
  readonly globalMarkers: readonly RenderGlobalMarker[];
  readonly tracks: readonly RenderTrack[];
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
  readonly choiceBreadcrumb: readonly RenderChoiceStep[];
  readonly currentChoiceOptions: readonly RenderChoiceOption[] | null;
  readonly currentChoiceDomain: RenderChoiceDomain | null;
  readonly choiceType: 'chooseOne' | 'chooseN' | null;
  readonly choiceMin: number | null;
  readonly choiceMax: number | null;
  readonly moveEnumerationWarnings: readonly RenderWarning[];
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
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RenderAdjacency {
  readonly from: string;
  readonly to: string;
}

export interface RenderMapSpace {
  readonly id: string;
  readonly displayName: string;
  readonly spaceType: string;
  readonly population: number;
  readonly econ: number;
  readonly terrainTags: readonly string[];
  readonly country: string;
  readonly coastal: boolean;
  readonly adjacentTo: readonly string[];
}

export interface RenderToken {
  readonly id: string;
  readonly type: string;
  readonly zoneID: string;
  readonly ownerID: PlayerId | null;
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
  readonly state: string;
  readonly possibleStates: readonly string[];
}

export interface RenderGlobalMarker {
  readonly id: string;
  readonly state: string;
  readonly possibleStates: readonly string[];
}

export interface RenderTrack {
  readonly id: string;
  readonly displayName: string;
  readonly scope: 'global' | 'faction';
  readonly faction: string | null;
  readonly min: number;
  readonly max: number;
  readonly currentValue: number;
}

export interface RenderLastingEffect {
  readonly id: string;
  readonly sourceCardId: string;
  readonly side: 'unshaded' | 'shaded';
  readonly duration: string;
  readonly displayName: string;
}

export interface RenderInterruptFrame {
  readonly phase: string;
  readonly resumePhase: string;
}

export interface RenderEventDeck {
  readonly id: string;
  readonly displayName: string;
  readonly drawZoneId: string;
  readonly discardZoneId: string;
  readonly currentCardId: string | null;
  readonly currentCardTitle: string | null;
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
  readonly groupName: string;
  readonly actions: readonly RenderAction[];
}

export interface RenderAction {
  readonly actionId: string;
  readonly displayName: string;
  readonly isAvailable: boolean;
}

export interface RenderChoiceStep {
  readonly decisionId: string;
  readonly name: string;
  readonly displayName: string;
  readonly chosenValue: MoveParamValue;
  readonly chosenDisplayName: string;
}

export interface RenderChoiceOption {
  readonly value: MoveParamValue;
  readonly displayName: string;
  readonly isLegal: boolean;
  readonly illegalReason: string | null;
}

export interface RenderChoiceDomain {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

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
