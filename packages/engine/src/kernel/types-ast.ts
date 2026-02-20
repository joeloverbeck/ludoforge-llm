import type { PlayerId, TokenId, ZoneId } from './branded.js';

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

export interface EffectMacroOrigin {
  readonly macroId: string;
  readonly stem: string;
}

export type Reference =
  | { readonly ref: 'gvar'; readonly var: string }
  | { readonly ref: 'pvar'; readonly player: PlayerSel; readonly var: string }
  | { readonly ref: 'zoneCount'; readonly zone: ZoneSel }
  | { readonly ref: 'tokenProp'; readonly token: TokenSel; readonly prop: string }
  | { readonly ref: 'assetField'; readonly row: string; readonly tableId: string; readonly field: string }
  | { readonly ref: 'binding'; readonly name: string }
  | { readonly ref: 'markerState'; readonly space: ZoneSel; readonly marker: string }
  | { readonly ref: 'globalMarkerState'; readonly marker: string }
  | { readonly ref: 'tokenZone'; readonly token: TokenSel }
  | { readonly ref: 'zoneProp'; readonly zone: ZoneSel; readonly prop: string }
  | { readonly ref: 'activePlayer' };

export type ValueExpr =
  | number
  | boolean
  | string
  | Reference
  | {
      readonly op: '+' | '-' | '*' | '/' | 'floorDiv' | 'ceilDiv';
      readonly left: ValueExpr;
      readonly right: ValueExpr;
    }
  | {
      readonly aggregate: {
        readonly op: 'count';
        readonly query: OptionsQuery;
      };
    }
  | {
      readonly aggregate: {
        readonly op: 'sum' | 'min' | 'max';
        readonly query: OptionsQuery;
        readonly bind: string;
        readonly valueExpr: NumericValueExpr;
      };
    }
  | { readonly concat: readonly ValueExpr[] }
  | {
      readonly if: {
        readonly when: ConditionAST;
        readonly then: ValueExpr;
        readonly else: ValueExpr;
      };
    };

export type NumericValueExpr =
  | number
  | Reference
  | {
      readonly op: '+' | '-' | '*' | '/' | 'floorDiv' | 'ceilDiv';
      readonly left: NumericValueExpr;
      readonly right: NumericValueExpr;
    }
  | {
      readonly aggregate: {
        readonly op: 'count';
        readonly query: OptionsQuery;
      };
    }
  | {
      readonly aggregate: {
        readonly op: 'sum' | 'min' | 'max';
        readonly query: OptionsQuery;
        readonly bind: string;
        readonly valueExpr: NumericValueExpr;
      };
    }
  | {
      readonly if: {
        readonly when: ConditionAST;
        readonly then: NumericValueExpr;
        readonly else: NumericValueExpr;
      };
    };

export type ConditionAST =
  | boolean
  | { readonly op: 'and'; readonly args: readonly ConditionAST[] }
  | { readonly op: 'or'; readonly args: readonly ConditionAST[] }
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
      readonly maxDepth?: number;
    }
  | {
      readonly op: 'zonePropIncludes';
      readonly zone: ZoneSel;
      readonly prop: string;
      readonly value: ValueExpr;
    };

export interface TokenFilterPredicate {
  readonly prop: string;
  readonly op: 'eq' | 'neq' | 'in' | 'notIn';
  readonly value: ValueExpr | readonly (string | number | boolean)[];
}

export interface AssetRowPredicate {
  readonly field: string;
  readonly op: 'eq' | 'neq' | 'in' | 'notIn';
  readonly value: ValueExpr | readonly (string | number | boolean)[];
}

export type AssetRowsCardinality = 'many' | 'exactlyOne' | 'zeroOrOne';

export type OptionsQuery =
  | { readonly query: 'concat'; readonly sources: readonly [OptionsQuery, ...OptionsQuery[]] }
  | { readonly query: 'tokensInZone'; readonly zone: ZoneRef; readonly filter?: readonly TokenFilterPredicate[] }
  | {
      readonly query: 'assetRows';
      readonly tableId: string;
      readonly where?: readonly AssetRowPredicate[];
      readonly cardinality?: AssetRowsCardinality;
    }
  | {
      readonly query: 'tokensInMapSpaces';
      readonly spaceFilter?: { readonly owner?: PlayerSel; readonly condition?: ConditionAST };
      readonly filter?: readonly TokenFilterPredicate[];
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
      readonly var: string;
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
  | { readonly query: 'tokensInAdjacentZones'; readonly zone: ZoneRef; readonly filter?: readonly TokenFilterPredicate[] }
  | {
      readonly query: 'connectedZones';
      readonly zone: ZoneRef;
      readonly via?: ConditionAST;
      readonly includeStart?: boolean;
      readonly maxDepth?: number;
    }
  | { readonly query: 'binding'; readonly name: string };

export type EffectAST =
  | {
      readonly setVar: {
        readonly scope: 'global' | 'pvar';
        readonly player?: PlayerSel;
        readonly var: string;
        readonly value: ValueExpr;
      };
    }
  | {
      readonly setActivePlayer: {
        readonly player: PlayerSel;
      };
    }
  | {
      readonly addVar: {
        readonly scope: 'global' | 'pvar';
        readonly player?: PlayerSel;
        readonly var: string;
        readonly delta: NumericValueExpr;
      };
    }
  | {
      readonly transferVar: {
        readonly from: { readonly scope: 'global' | 'pvar'; readonly var: string; readonly player?: PlayerSel };
        readonly to: { readonly scope: 'global' | 'pvar'; readonly var: string; readonly player?: PlayerSel };
        readonly amount: NumericValueExpr;
        readonly min?: NumericValueExpr;
        readonly max?: NumericValueExpr;
        readonly actualBind?: string;
      };
    }
  | {
      readonly moveToken: {
        readonly token: TokenSel;
        readonly from: ZoneRef;
        readonly to: ZoneRef;
        readonly position?: 'top' | 'bottom' | 'random';
      };
    }
  | {
      readonly moveAll: {
        readonly from: ZoneRef;
        readonly to: ZoneRef;
        readonly filter?: ConditionAST;
      };
    }
  | {
      readonly moveTokenAdjacent: {
        readonly token: TokenSel;
        readonly from: ZoneRef;
        readonly direction?: string;
      };
    }
  | {
      readonly draw: {
        readonly from: ZoneRef;
        readonly to: ZoneRef;
        readonly count: number;
      };
    }
  | {
      readonly reveal: {
        readonly zone: ZoneRef;
        readonly to: 'all' | PlayerSel;
        readonly filter?: readonly TokenFilterPredicate[];
      };
    }
  | { readonly shuffle: { readonly zone: ZoneRef } }
  | {
      readonly createToken: {
        readonly type: string;
        readonly zone: ZoneRef;
        readonly props?: Readonly<Record<string, ValueExpr>>;
      };
    }
  | { readonly destroyToken: { readonly token: TokenSel } }
  | {
      readonly setTokenProp: {
        readonly token: TokenSel;
        readonly prop: string;
        readonly value: ValueExpr;
      };
    }
  | {
      readonly if: {
        readonly when: ConditionAST;
        readonly then: readonly EffectAST[];
        readonly else?: readonly EffectAST[];
      };
    }
  | {
      readonly forEach: {
        readonly bind: string;
        readonly macroOrigin?: EffectMacroOrigin;
        readonly over: OptionsQuery;
        readonly effects: readonly EffectAST[];
        readonly limit?: NumericValueExpr;
        readonly countBind?: string;
        readonly in?: readonly EffectAST[];
      };
    }
  | {
      readonly reduce: {
        readonly itemBind: string;
        readonly accBind: string;
        readonly macroOrigin?: EffectMacroOrigin;
        readonly over: OptionsQuery;
        readonly initial: ValueExpr;
        readonly next: ValueExpr;
        readonly limit?: NumericValueExpr;
        readonly resultBind: string;
        readonly in: readonly EffectAST[];
      };
    }
  | {
      readonly removeByPriority: {
        readonly budget: NumericValueExpr;
        readonly groups: readonly {
          readonly bind: string;
          readonly over: OptionsQuery;
          readonly to: ZoneRef;
          readonly from?: ZoneRef;
          readonly countBind?: string;
        }[];
        readonly remainingBind?: string;
        readonly in?: readonly EffectAST[];
      };
    }
  | {
      readonly let: {
        readonly bind: string;
        readonly value: ValueExpr;
        readonly in: readonly EffectAST[];
      };
    }
  | {
      readonly bindValue: {
        readonly bind: string;
        readonly value: ValueExpr;
      };
    }
  | {
      readonly evaluateSubset: {
        readonly source: OptionsQuery;
        readonly subsetSize: NumericValueExpr;
        readonly subsetBind: string;
        readonly compute: readonly EffectAST[];
        readonly scoreExpr: NumericValueExpr;
        readonly resultBind: string;
        readonly bestSubsetBind?: string;
        readonly in: readonly EffectAST[];
      };
    }
  | {
      readonly chooseOne: {
        readonly internalDecisionId: string;
        readonly bind: string;
        readonly options: OptionsQuery;
      };
    }
  | {
      readonly chooseN: {
        readonly internalDecisionId: string;
        readonly bind: string;
        readonly options: OptionsQuery;
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
    }
  | {
      readonly rollRandom: {
        readonly bind: string;
        readonly min: NumericValueExpr;
        readonly max: NumericValueExpr;
        readonly in: readonly EffectAST[];
      };
    }
  | {
      readonly setMarker: {
        readonly space: ZoneRef;
        readonly marker: string;
        readonly state: ValueExpr;
      };
    }
  | {
      readonly shiftMarker: {
        readonly space: ZoneRef;
        readonly marker: string;
        readonly delta: NumericValueExpr;
      };
    }
  | {
      readonly setGlobalMarker: {
        readonly marker: string;
        readonly state: ValueExpr;
      };
    }
  | {
      readonly flipGlobalMarker: {
        readonly marker: ValueExpr;
        readonly stateA: ValueExpr;
        readonly stateB: ValueExpr;
      };
    }
  | {
      readonly shiftGlobalMarker: {
        readonly marker: string;
        readonly delta: NumericValueExpr;
      };
    }
  | {
      readonly grantFreeOperation: {
        readonly id?: string;
        readonly faction: string;
        readonly executeAsFaction?: string;
        readonly operationClass: 'pass' | 'event' | 'operation' | 'limitedOperation' | 'operationPlusSpecialActivity';
        readonly actionIds?: readonly string[];
        readonly zoneFilter?: ConditionAST;
        readonly uses?: number;
        readonly sequence?: {
          readonly chain: string;
          readonly step: number;
        };
      };
    }
  | {
      readonly gotoPhaseExact: {
        readonly phase: string;
      };
    }
  | {
      readonly advancePhase: Record<string, never>;
    }
  | {
      readonly pushInterruptPhase: {
        readonly phase: string;
        readonly resumePhase: string;
      };
    }
  | {
      readonly popInterruptPhase: Record<string, never>;
    };

export type MoveParamScalar = number | string | boolean | TokenId | ZoneId | PlayerId;
export type MoveParamValue = MoveParamScalar | readonly MoveParamScalar[];
