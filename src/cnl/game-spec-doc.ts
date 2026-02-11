export interface GameSpecMetadata {
  readonly id: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly maxTriggerDepth?: number;
}

export interface GameSpecVarDef {
  readonly name: string;
  readonly type: string;
  readonly init: number;
  readonly min: number;
  readonly max: number;
}

export interface GameSpecZoneDef {
  readonly id: string;
  readonly owner: string;
  readonly visibility: string;
  readonly ordering: string;
  readonly adjacentTo?: readonly string[];
}

export interface GameSpecTokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, string>>;
}

export interface GameSpecTurnStructure {
  readonly phases: readonly GameSpecPhaseDef[];
  readonly activePlayerOrder: string;
}

export interface GameSpecPhaseDef {
  readonly id: string;
  readonly onEnter?: readonly unknown[];
  readonly onExit?: readonly unknown[];
}

export interface GameSpecEffect {
  readonly [key: string]: unknown;
}

export interface GameSpecActionDef {
  readonly id: string;
  readonly actor: unknown;
  readonly phase: string;
  readonly params: readonly unknown[];
  readonly pre: unknown | null;
  readonly cost: readonly unknown[];
  readonly effects: readonly unknown[];
  readonly limits: readonly unknown[];
}

export interface GameSpecTriggerDef {
  readonly id?: string;
  readonly event?: unknown;
  readonly when?: unknown;
  readonly match?: unknown;
  readonly effects: readonly unknown[];
}

export interface GameSpecEndCondition {
  readonly when: unknown;
  readonly result: unknown;
}

export interface GameSpecDataAsset {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
}

export interface GameSpecDoc {
  readonly metadata: GameSpecMetadata | null;
  readonly constants: Readonly<Record<string, number>> | null;
  readonly dataAssets: readonly GameSpecDataAsset[] | null;
  readonly globalVars: readonly GameSpecVarDef[] | null;
  readonly perPlayerVars: readonly GameSpecVarDef[] | null;
  readonly zones: readonly GameSpecZoneDef[] | null;
  readonly tokenTypes: readonly GameSpecTokenTypeDef[] | null;
  readonly setup: readonly GameSpecEffect[] | null;
  readonly turnStructure: GameSpecTurnStructure | null;
  readonly actions: readonly GameSpecActionDef[] | null;
  readonly triggers: readonly GameSpecTriggerDef[] | null;
  readonly endConditions: readonly GameSpecEndCondition[] | null;
}

export function createEmptyGameSpecDoc(): GameSpecDoc {
  return {
    metadata: null,
    constants: null,
    dataAssets: null,
    globalVars: null,
    perPlayerVars: null,
    zones: null,
    tokenTypes: null,
    setup: null,
    turnStructure: null,
    actions: null,
    triggers: null,
    endConditions: null,
  };
}
