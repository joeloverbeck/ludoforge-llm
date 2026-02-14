import type { PlayerId, TokenId, ZoneId } from './branded.js';

export type PlayerSel =
  | 'actor'
  | 'active'
  | 'all'
  | 'allOther'
  | { readonly id: PlayerId }
  | { readonly chosen: string }
  | { readonly relative: 'left' | 'right' };

export type ZoneSel = string;
export type ZoneRef = ZoneSel | { readonly zoneExpr: ValueExpr };
export type TokenSel = string;

export type Reference =
  | { readonly ref: 'gvar'; readonly var: string }
  | { readonly ref: 'pvar'; readonly player: PlayerSel; readonly var: string }
  | { readonly ref: 'zoneCount'; readonly zone: ZoneSel }
  | { readonly ref: 'tokenProp'; readonly token: TokenSel; readonly prop: string }
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
        readonly op: 'sum' | 'count' | 'min' | 'max';
        readonly query: OptionsQuery;
        readonly prop?: string;
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
  readonly value: ValueExpr | readonly string[];
}

export type OptionsQuery =
  | { readonly query: 'tokensInZone'; readonly zone: ZoneSel; readonly filter?: readonly TokenFilterPredicate[] }
  | { readonly query: 'intsInRange'; readonly min: number; readonly max: number }
  | { readonly query: 'enums'; readonly values: readonly string[] }
  | { readonly query: 'players' }
  | { readonly query: 'zones'; readonly filter?: { readonly owner?: PlayerSel; readonly condition?: ConditionAST } }
  | { readonly query: 'mapSpaces'; readonly filter?: { readonly owner?: PlayerSel; readonly condition?: ConditionAST } }
  | { readonly query: 'adjacentZones'; readonly zone: ZoneSel }
  | { readonly query: 'tokensInAdjacentZones'; readonly zone: ZoneSel; readonly filter?: readonly TokenFilterPredicate[] }
  | {
      readonly query: 'connectedZones';
      readonly zone: ZoneSel;
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
      readonly addVar: {
        readonly scope: 'global' | 'pvar';
        readonly player?: PlayerSel;
        readonly var: string;
        readonly delta: ValueExpr;
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
        readonly over: OptionsQuery;
        readonly effects: readonly EffectAST[];
        readonly limit?: ValueExpr;
        readonly countBind?: string;
        readonly in?: readonly EffectAST[];
      };
    }
  | {
      readonly removeByPriority: {
        readonly budget: ValueExpr;
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
            readonly min?: number;
            readonly max: number;
            readonly n?: never;
          }
      );
    }
  | {
      readonly rollRandom: {
        readonly bind: string;
        readonly min: ValueExpr;
        readonly max: ValueExpr;
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
        readonly delta: ValueExpr;
      };
    }
  | {
      readonly setGlobalMarker: {
        readonly marker: string;
        readonly state: ValueExpr;
      };
    }
  | {
      readonly shiftGlobalMarker: {
        readonly marker: string;
        readonly delta: ValueExpr;
      };
    };

export type MoveParamScalar = number | string | boolean | TokenId | ZoneId | PlayerId;
export type MoveParamValue = MoveParamScalar | readonly MoveParamScalar[];
