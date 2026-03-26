import type { PlayerId, TokenId, ZoneId } from './branded.js';
import type { PredicateOp } from '../contracts/index.js';
import type { FreeOperationSequenceContextContract } from './free-operation-sequence-context-contract.js';
import type { ScopedVarEndpointContract, ScopedVarPayloadContract } from './scoped-var-contract.js';
import type {
  TurnFlowActionClass,
  TurnFlowFreeOperationGrantViabilityPolicy,
} from '../contracts/index.js';

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type PlayerSel =
  | 'actor'
  | 'active'
  | 'all'
  | 'allOther'
  | { readonly id: PlayerId }
  | { readonly chosen: string }
  | { readonly relative: 'left' | 'right' };

export type ActionExecutorSel =
  | 'actor'
  | 'active'
  | { readonly id: PlayerId }
  | { readonly chosen: string }
  | { readonly relative: 'left' | 'right' };

export type ZoneSel = string;
export type ZoneRef = ZoneSel | { readonly zoneExpr: ValueExpr };
export type TokenSel = string;
export type FreeOperationExecutionContextScalar = string | number | boolean;
export type ScalarValue = FreeOperationExecutionContextScalar;
export type ScalarArrayValue = readonly ScalarValue[];
export interface FreeOperationTokenInterpretationRule {
  readonly when: TokenFilterExpr;
  readonly assign: Readonly<Record<string, ScalarValue>>;
}

export interface EffectMacroOrigin {
  readonly macroId: string;
  readonly stem: string;
}

export type ScopedVarNameExpr =
  | string
  | { readonly ref: 'binding'; readonly name: string; readonly displayName?: string }
  | { readonly ref: 'grantContext'; readonly key: string };

export type Reference =
  | { readonly ref: 'gvar'; readonly var: ScopedVarNameExpr }
  | { readonly ref: 'pvar'; readonly player: PlayerSel; readonly var: ScopedVarNameExpr }
  | { readonly ref: 'zoneVar'; readonly zone: ZoneSel; readonly var: ScopedVarNameExpr }
  | { readonly ref: 'zoneCount'; readonly zone: ZoneSel }
  | { readonly ref: 'tokenProp'; readonly token: TokenSel; readonly prop: string }
  | { readonly ref: 'assetField'; readonly row: string; readonly tableId: string; readonly field: string }
  | { readonly ref: 'binding'; readonly name: string; readonly displayName?: string }
  | { readonly ref: 'markerState'; readonly space: ZoneSel; readonly marker: string }
  | { readonly ref: 'globalMarkerState'; readonly marker: string }
  | { readonly ref: 'tokenZone'; readonly token: TokenSel }
  | { readonly ref: 'zoneProp'; readonly zone: ZoneSel; readonly prop: string }
  | { readonly ref: 'activePlayer' }
  | { readonly ref: 'activeSeat' }
  | { readonly ref: 'grantContext'; readonly key: string }
  | { readonly ref: 'capturedSequenceZones'; readonly key: FreeOperationSequenceKeyExpr };

export type FreeOperationSequenceKeyExpr =
  | string
  | { readonly ref: 'binding'; readonly name: string; readonly displayName?: string }
  | { readonly ref: 'grantContext'; readonly key: string };

export const VALUE_EXPR_TAG = {
  SCALAR_ARRAY: 1,
  REF: 2,
  CONCAT: 3,
  IF: 4,
  AGGREGATE: 5,
  OP: 6,
} as const;

export type ValueExprTag = typeof VALUE_EXPR_TAG[keyof typeof VALUE_EXPR_TAG];

export const EFFECT_KIND_TAG = {
  setVar: 0,
  addVar: 1,
  setActivePlayer: 2,
  transferVar: 3,
  moveToken: 4,
  moveAll: 5,
  moveTokenAdjacent: 6,
  draw: 7,
  shuffle: 8,
  createToken: 9,
  destroyToken: 10,
  setTokenProp: 11,
  reveal: 12,
  conceal: 13,
  bindValue: 14,
  chooseOne: 15,
  chooseN: 16,
  setMarker: 17,
  shiftMarker: 18,
  setGlobalMarker: 19,
  flipGlobalMarker: 20,
  shiftGlobalMarker: 21,
  grantFreeOperation: 22,
  gotoPhaseExact: 23,
  advancePhase: 24,
  pushInterruptPhase: 25,
  popInterruptPhase: 26,
  rollRandom: 27,
  if: 28,
  forEach: 29,
  reduce: 30,
  removeByPriority: 31,
  let: 32,
  evaluateSubset: 33,
} as const;

export type EffectKindTag = typeof EFFECT_KIND_TAG[keyof typeof EFFECT_KIND_TAG];

export type ValueExpr =
  | number
  | boolean
  | string
  | { readonly _t: 1; readonly scalarArray: ScalarArrayValue }
  | (Reference & { readonly _t: 2 })
  | {
      readonly _t: 6;
      readonly op: '+' | '-' | '*' | '/' | 'floorDiv' | 'ceilDiv' | 'min' | 'max';
      readonly left: ValueExpr;
      readonly right: ValueExpr;
    }
  | {
      readonly _t: 5;
      readonly aggregate: {
        readonly op: 'count';
        readonly query: OptionsQuery;
      };
    }
  | {
      readonly _t: 5;
      readonly aggregate: {
        readonly op: 'sum' | 'min' | 'max';
        readonly query: OptionsQuery;
        readonly bind: string;
        readonly valueExpr: NumericValueExpr;
      };
    }
  | { readonly _t: 3; readonly concat: readonly ValueExpr[] }
  | {
      readonly _t: 4;
      readonly if: {
        readonly when: ConditionAST;
        readonly then: ValueExpr;
        readonly else: ValueExpr;
      };
    };

export type FreeOperationExecutionContextValue = ValueExpr;
export type FreeOperationExecutionContext = Readonly<Record<string, FreeOperationExecutionContextValue>>;

export type NumericValueExpr =
  | number
  | (Reference & { readonly _t: 2 })
  | {
      readonly _t: 6;
      readonly op: '+' | '-' | '*' | '/' | 'floorDiv' | 'ceilDiv' | 'min' | 'max';
      readonly left: NumericValueExpr;
      readonly right: NumericValueExpr;
    }
  | {
      readonly _t: 5;
      readonly aggregate: {
        readonly op: 'count';
        readonly query: OptionsQuery;
      };
    }
  | {
      readonly _t: 5;
      readonly aggregate: {
        readonly op: 'sum' | 'min' | 'max';
        readonly query: OptionsQuery;
        readonly bind: string;
        readonly valueExpr: NumericValueExpr;
      };
    }
  | {
      readonly _t: 4;
      readonly if: {
        readonly when: ConditionAST;
        readonly then: NumericValueExpr;
        readonly else: NumericValueExpr;
      };
    };

export type ConditionAST =
  | boolean
  | { readonly op: 'and'; readonly args: NonEmptyReadonlyArray<ConditionAST> }
  | { readonly op: 'or'; readonly args: NonEmptyReadonlyArray<ConditionAST> }
  | { readonly op: 'not'; readonly arg: ConditionAST }
  | {
      readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=';
      readonly left: ValueExpr;
      readonly right: ValueExpr;
    }
  | { readonly op: 'in'; readonly item: ValueExpr; readonly set: ValueExpr }
  | { readonly op: 'adjacent'; readonly left: ZoneSel; readonly right: ZoneSel }
  | {
      readonly op: 'connected';
      readonly from: ZoneSel;
      readonly to: ZoneSel;
      readonly via?: ConditionAST;
      readonly allowTargetOutsideVia?: boolean;
      readonly maxDepth?: number;
    }
  | {
      readonly op: 'zonePropIncludes';
      readonly zone: ZoneSel;
      readonly prop: string;
      readonly value: ValueExpr;
    }
  | {
      readonly op: 'markerStateAllowed';
      readonly space: ZoneSel;
      readonly marker: string;
      readonly state: ValueExpr;
    }
  | {
      readonly op: 'markerShiftAllowed';
      readonly space: ZoneSel;
      readonly marker: string;
      readonly delta: NumericValueExpr;
    };

export type TokenFilterFieldSelector =
  | { readonly kind: 'prop'; readonly prop: string }
  | { readonly kind: 'tokenId' }
  | { readonly kind: 'tokenZone' }
  | { readonly kind: 'zoneProp'; readonly prop: string };

export interface TokenFilterPredicate {
  readonly prop?: string;
  readonly field?: TokenFilterFieldSelector;
  readonly op: PredicateOp;
  readonly value: ValueExpr | readonly (string | number | boolean)[];
}

export type TokenFilterExpr =
  | TokenFilterPredicate
  | { readonly op: 'and'; readonly args: NonEmptyReadonlyArray<TokenFilterExpr> }
  | { readonly op: 'or'; readonly args: NonEmptyReadonlyArray<TokenFilterExpr> }
  | { readonly op: 'not'; readonly arg: TokenFilterExpr };

export interface AssetRowPredicate {
  readonly field: string;
  readonly op: PredicateOp;
  readonly value: ValueExpr | readonly (string | number | boolean)[];
}

export type AssetRowsCardinality = 'many' | 'exactlyOne' | 'zeroOrOne';

export type OptionsQuery =
  | { readonly query: 'concat'; readonly sources: readonly [OptionsQuery, ...OptionsQuery[]] }
  | {
      readonly query: 'prioritized';
      readonly tiers: readonly [OptionsQuery, ...OptionsQuery[]];
      readonly qualifierKey?: string;
    }
  | {
      readonly query: 'tokenZones';
      readonly source: OptionsQuery;
      readonly dedupe?: boolean;
    }
  | { readonly query: 'tokensInZone'; readonly zone: ZoneRef; readonly filter?: TokenFilterExpr }
  | {
      readonly query: 'assetRows';
      readonly tableId: string;
      readonly where?: readonly AssetRowPredicate[];
      readonly cardinality?: AssetRowsCardinality;
    }
  | {
      readonly query: 'tokensInMapSpaces';
      readonly spaceFilter?: { readonly owner?: PlayerSel; readonly condition?: ConditionAST };
      readonly filter?: TokenFilterExpr;
    }
  | {
      readonly query: 'nextInOrderByCondition';
      readonly source: OptionsQuery;
      readonly from: ValueExpr;
      readonly bind: string;
      readonly where: ConditionAST;
      readonly includeFrom?: boolean;
    }
  | {
      readonly query: 'intsInRange';
      readonly min: NumericValueExpr;
      readonly max: NumericValueExpr;
      readonly step?: NumericValueExpr;
      readonly alwaysInclude?: readonly NumericValueExpr[];
      readonly maxResults?: NumericValueExpr;
    }
  | {
      readonly query: 'intsInVarRange';
      readonly var: ScopedVarNameExpr;
      readonly scope?: 'global' | 'perPlayer';
      readonly min?: NumericValueExpr;
      readonly max?: NumericValueExpr;
      readonly step?: NumericValueExpr;
      readonly alwaysInclude?: readonly NumericValueExpr[];
      readonly maxResults?: NumericValueExpr;
    }
  | { readonly query: 'enums'; readonly values: readonly string[] }
  | { readonly query: 'globalMarkers'; readonly markers?: readonly string[]; readonly states?: readonly string[] }
  | { readonly query: 'players' }
  | { readonly query: 'zones'; readonly filter?: { readonly owner?: PlayerSel; readonly condition?: ConditionAST } }
  | { readonly query: 'mapSpaces'; readonly filter?: { readonly owner?: PlayerSel; readonly condition?: ConditionAST } }
  | { readonly query: 'adjacentZones'; readonly zone: ZoneRef }
  | { readonly query: 'tokensInAdjacentZones'; readonly zone: ZoneRef; readonly filter?: TokenFilterExpr }
  | {
      readonly query: 'connectedZones';
      readonly zone: ZoneRef;
      readonly via?: ConditionAST;
      readonly includeStart?: boolean;
      readonly allowTargetOutsideVia?: boolean;
      readonly maxDepth?: number;
    }
  | { readonly query: 'binding'; readonly name: string; readonly displayName?: string }
  | { readonly query: 'grantContext'; readonly key: string }
  | { readonly query: 'capturedSequenceZones'; readonly key: FreeOperationSequenceKeyExpr };

export type TransferVarEndpoint = ScopedVarEndpointContract<
  'global',
  'pvar',
  'zoneVar',
  'var',
  'player',
  'zone',
  PlayerSel,
  ZoneRef,
  ScopedVarNameExpr
>;

export type SetVarPayload = ScopedVarPayloadContract<
  'global',
  'pvar',
  'zoneVar',
  'var',
  'player',
  'zone',
  PlayerSel,
  ZoneRef,
  { readonly value: ValueExpr },
  ScopedVarNameExpr
>;

export type AddVarPayload = ScopedVarPayloadContract<
  'global',
  'pvar',
  'zoneVar',
  'var',
  'player',
  'zone',
  PlayerSel,
  ZoneRef,
  { readonly delta: NumericValueExpr },
  ScopedVarNameExpr
>;

export interface EffectKindMap {
  readonly setVar: {
    readonly setVar: SetVarPayload;
  };
  readonly setActivePlayer: {
    readonly setActivePlayer: {
      readonly player: PlayerSel;
    };
  };
  readonly addVar: {
    readonly addVar: AddVarPayload;
  };
  readonly transferVar: {
    readonly transferVar: {
      readonly from: TransferVarEndpoint;
      readonly to: TransferVarEndpoint;
      readonly amount: NumericValueExpr;
      readonly min?: NumericValueExpr;
      readonly max?: NumericValueExpr;
      readonly actualBind?: string;
      readonly macroOrigin?: EffectMacroOrigin;
    };
  };
  readonly moveToken: {
    readonly moveToken: {
      readonly token: TokenSel;
      readonly from: ZoneRef;
      readonly to: ZoneRef;
      readonly position?: 'top' | 'bottom' | 'random';
    };
  };
  readonly moveAll: {
    readonly moveAll: {
      readonly from: ZoneRef;
      readonly to: ZoneRef;
      readonly filter?: ConditionAST;
    };
  };
  readonly moveTokenAdjacent: {
    readonly moveTokenAdjacent: {
      readonly token: TokenSel;
      readonly from: ZoneRef;
      readonly direction?: string;
    };
  };
  readonly draw: {
    readonly draw: {
      readonly from: ZoneRef;
      readonly to: ZoneRef;
      readonly count: number;
    };
  };
  readonly reveal: {
    readonly reveal: {
      readonly zone: ZoneRef;
      readonly to: 'all' | PlayerSel;
      readonly filter?: TokenFilterExpr;
    };
  };
  readonly conceal: {
    readonly conceal: {
      readonly zone: ZoneRef;
      readonly from?: 'all' | PlayerSel;
      readonly filter?: TokenFilterExpr;
    };
  };
  readonly shuffle: { readonly shuffle: { readonly zone: ZoneRef } };
  readonly createToken: {
    readonly createToken: {
      readonly type: string;
      readonly zone: ZoneRef;
      readonly props?: Readonly<Record<string, ValueExpr>>;
    };
  };
  readonly destroyToken: { readonly destroyToken: { readonly token: TokenSel } };
  readonly setTokenProp: {
    readonly setTokenProp: {
      readonly token: TokenSel;
      readonly prop: string;
      readonly value: ValueExpr;
    };
  };
  readonly if: {
    readonly if: {
      readonly when: ConditionAST;
      readonly then: readonly EffectAST[];
      readonly else?: readonly EffectAST[];
    };
  };
  readonly forEach: {
    readonly forEach: {
      readonly bind: string;
      readonly macroOrigin?: EffectMacroOrigin;
      readonly over: OptionsQuery;
      readonly effects: readonly EffectAST[];
      readonly limit?: NumericValueExpr;
      readonly countBind?: string;
      readonly in?: readonly EffectAST[];
    };
  };
  readonly reduce: {
    readonly reduce: {
      readonly itemBind: string;
      readonly accBind: string;
      readonly itemMacroOrigin?: EffectMacroOrigin;
      readonly accMacroOrigin?: EffectMacroOrigin;
      readonly over: OptionsQuery;
      readonly initial: ValueExpr;
      readonly next: ValueExpr;
      readonly limit?: NumericValueExpr;
      readonly resultBind: string;
      readonly resultMacroOrigin?: EffectMacroOrigin;
      readonly in: readonly EffectAST[];
    };
  };
  readonly removeByPriority: {
    readonly removeByPriority: {
      readonly budget: NumericValueExpr;
      readonly groups: readonly {
        readonly bind: string;
        readonly over: OptionsQuery;
        readonly to: ZoneRef;
        readonly from?: ZoneRef;
        readonly countBind?: string;
        readonly macroOrigin?: EffectMacroOrigin;
      }[];
      readonly remainingBind?: string;
      readonly in?: readonly EffectAST[];
      readonly macroOrigin?: EffectMacroOrigin;
    };
  };
  readonly let: {
    readonly let: {
      readonly bind: string;
      readonly value: ValueExpr;
      readonly in: readonly EffectAST[];
      readonly macroOrigin?: EffectMacroOrigin;
    };
  };
  readonly bindValue: {
    readonly bindValue: {
      readonly bind: string;
      readonly value: ValueExpr;
      readonly macroOrigin?: EffectMacroOrigin;
    };
  };
  readonly evaluateSubset: {
    readonly evaluateSubset: {
      readonly source: OptionsQuery;
      readonly subsetSize: NumericValueExpr;
      readonly subsetBind: string;
      readonly compute: readonly EffectAST[];
      readonly scoreExpr: NumericValueExpr;
      readonly resultBind: string;
      readonly bestSubsetBind?: string;
      readonly in: readonly EffectAST[];
      readonly macroOrigin?: EffectMacroOrigin;
    };
  };
  readonly chooseOne: {
    readonly chooseOne: {
      readonly internalDecisionId: string;
      readonly bind: string;
      readonly decisionIdentity?: string;
      readonly options: OptionsQuery;
      readonly chooser?: PlayerSel;
      readonly macroOrigin?: EffectMacroOrigin;
    };
  };
  readonly chooseN: {
    readonly chooseN: {
      readonly internalDecisionId: string;
      readonly bind: string;
      readonly decisionIdentity?: string;
      readonly options: OptionsQuery;
      readonly chooser?: PlayerSel;
      readonly macroOrigin?: EffectMacroOrigin;
    } & (
      | {
          readonly n: number;
          readonly min?: never;
          readonly max?: never;
        }
      | {
          readonly min?: NumericValueExpr;
          readonly max: NumericValueExpr;
          readonly n?: never;
        }
    );
  };
  readonly rollRandom: {
    readonly rollRandom: {
      readonly bind: string;
      readonly min: NumericValueExpr;
      readonly max: NumericValueExpr;
      readonly in: readonly EffectAST[];
      readonly macroOrigin?: EffectMacroOrigin;
    };
  };
  readonly setMarker: {
    readonly setMarker: {
      readonly space: ZoneRef;
      readonly marker: string;
      readonly state: ValueExpr;
    };
  };
  readonly shiftMarker: {
    readonly shiftMarker: {
      readonly space: ZoneRef;
      readonly marker: string;
      readonly delta: NumericValueExpr;
    };
  };
  readonly setGlobalMarker: {
    readonly setGlobalMarker: {
      readonly marker: string;
      readonly state: ValueExpr;
    };
  };
  readonly flipGlobalMarker: {
    readonly flipGlobalMarker: {
      readonly marker: ValueExpr;
      readonly stateA: ValueExpr;
      readonly stateB: ValueExpr;
    };
  };
  readonly shiftGlobalMarker: {
    readonly shiftGlobalMarker: {
      readonly marker: string;
      readonly delta: NumericValueExpr;
    };
  };
  readonly grantFreeOperation: {
    readonly grantFreeOperation: {
      readonly id?: string;
      readonly seat: string;
      readonly executeAsSeat?: string;
      readonly operationClass: TurnFlowActionClass;
      readonly actionIds?: readonly string[];
      readonly zoneFilter?: ConditionAST;
      readonly tokenInterpretations?: readonly FreeOperationTokenInterpretationRule[];
      readonly moveZoneBindings?: readonly string[];
      readonly moveZoneProbeBindings?: readonly string[];
      readonly allowDuringMonsoon?: boolean;
      readonly uses?: number;
      readonly viabilityPolicy?: TurnFlowFreeOperationGrantViabilityPolicy;
      readonly completionPolicy?: import('../contracts/index.js').TurnFlowFreeOperationGrantCompletionPolicy;
      readonly outcomePolicy?: import('../contracts/index.js').TurnFlowFreeOperationGrantOutcomePolicy;
      readonly postResolutionTurnFlow?: import('../contracts/index.js').TurnFlowFreeOperationGrantPostResolutionTurnFlow;
      readonly sequence?: {
        readonly batch: string;
        readonly step: number;
        readonly progressionPolicy?: import('../contracts/index.js').TurnFlowFreeOperationGrantProgressionPolicy;
      };
      readonly sequenceContext?: FreeOperationSequenceContextContract;
      readonly executionContext?: FreeOperationExecutionContext;
    };
  };
  readonly gotoPhaseExact: {
    readonly gotoPhaseExact: {
      readonly phase: string;
    };
  };
  readonly advancePhase: {
    readonly advancePhase: Record<string, never>;
  };
  readonly pushInterruptPhase: {
    readonly pushInterruptPhase: {
      readonly phase: string;
      readonly resumePhase: string;
    };
  };
  readonly popInterruptPhase: {
    readonly popInterruptPhase: Record<string, never>;
  };
}

export type EffectKind = keyof EffectKindMap;

export type WithKindTag<K extends EffectKind> =
  EffectKindMap[K] & { readonly _k: typeof EFFECT_KIND_TAG[K] };

export type EffectOfKind<K extends EffectKind> = WithKindTag<K>;
export type EffectAST = { [K in EffectKind]: WithKindTag<K> }[EffectKind];

void (EFFECT_KIND_TAG satisfies Record<EffectKind, number>);

export type MoveParamScalar = number | string | boolean | TokenId | ZoneId | PlayerId;
export type MoveParamValue = MoveParamScalar | readonly MoveParamScalar[];
export type ResolvedFreeOperationExecutionContextValue = MoveParamValue;
export type ResolvedFreeOperationExecutionContext = Readonly<Record<string, ResolvedFreeOperationExecutionContextValue>>;
