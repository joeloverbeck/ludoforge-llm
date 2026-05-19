import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type {
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  CompiledSurfaceRef,
  GameDef,
  GameState,
} from '../kernel/types.js';
import { resolvePolicyStandingRoleSelector } from './policy-surface.js';
import type { PolicyValue } from './policy-surface.js';
import type { PolicyWasmPrecomputedDynamicCandidateFeature } from './policy-wasm-runtime.js';

export const previewSurfaceCode = (ref: CompiledSurfaceRef): number =>
  stablePayloadCode({ family: ref.family, id: ref.id, selector: ref.selector });

export const previewDynamicRefCode = (ref: CompiledAgentPolicyRef): number => {
  if (ref.kind === 'previewSurface') {
    return previewSurfaceCode(ref);
  }
  return stablePayloadCode(ref);
};

export const seatContextIdsForPreviewDynamicRefs = (
  def: GameDef,
  refs: readonly CompiledAgentPolicyRef[],
  compare: (left: string, right: string) => number,
): readonly string[] =>
  refs.some((ref) =>
    ref.kind === 'previewSurface'
    && ref.selector?.kind === 'role'
    && ref.selector.seatToken === '$seat',
  )
    ? [...(def.seats?.map((seat) => seat.id) ?? [])].sort(compare)
    : [];

const dynamicCandidateFeatureByCode = (
  rows: readonly PolicyWasmPrecomputedDynamicCandidateFeature[],
): ReadonlyMap<number, PolicyWasmPrecomputedDynamicCandidateFeature> =>
  new Map(rows.map((row) => [row.code, row]));

const resolveSeatAggOver = (
  def: GameDef,
  state: GameState,
  over: Extract<CompiledPolicyExpr, { readonly kind: 'seatAgg' }>['over'],
  seatId: string,
): readonly string[] | undefined => {
  const seatIds = def.seats?.map((seat) => seat.id);
  if (seatIds === undefined) {
    return undefined;
  }
  if (over === 'all') {
    return seatIds;
  }
  if (over === 'opponents') {
    return seatIds.filter((candidateSeatId) => candidateSeatId !== seatId);
  }
  if ('role' in over) {
    const resolved = resolvePolicyStandingRoleSelector(def, state, over.role, seatId);
    return resolved === undefined ? undefined : [resolved];
  }
  return over;
};

const evaluateDynamicCandidateFeatureExpr = (
  input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly seatId: string;
    readonly dynamicRows: ReadonlyMap<number, PolicyWasmPrecomputedDynamicCandidateFeature>;
  },
  expr: CompiledPolicyExpr,
  candidateIndex: number,
  seatContext?: string,
): PolicyValue => {
  switch (expr.kind) {
    case 'literal':
      return expr.value === null ? undefined : expr.value;
    case 'ref': {
      const ref = expr.ref;
      if (
        ref.kind !== 'previewSurface'
        && !(ref.kind === 'library' && ref.refKind === 'previewStateFeature')
      ) {
        return undefined;
      }
      const row = input.dynamicRows.get(previewDynamicRefCode(ref));
      if (row === undefined) {
        return undefined;
      }
      return seatContext === undefined
        ? row.values[candidateIndex]
        : row.seatContextValues?.[seatContext]?.[candidateIndex];
    }
    case 'op': {
      const values = expr.args.map((arg) =>
        evaluateDynamicCandidateFeatureExpr(input, arg, candidateIndex, seatContext));
      switch (expr.op) {
        case 'coalesce':
          return values.find((value) => value !== undefined);
        case 'add':
          return values.every((value): value is number => typeof value === 'number')
            ? values.reduce((total, value) => total + value, 0)
            : undefined;
        case 'sub':
          return typeof values[0] === 'number' && typeof values[1] === 'number'
            ? values[0] - values[1]
            : undefined;
        case 'mul':
          return values.every((value): value is number => typeof value === 'number')
            ? values.reduce((total, value) => total * value, 1)
            : undefined;
        case 'div':
          return typeof values[0] === 'number' && typeof values[1] === 'number' && values[1] !== 0
            ? Math.trunc(values[0] / values[1])
            : undefined;
        case 'min':
          return values.every((value): value is number => typeof value === 'number')
            ? Math.min(...values)
            : undefined;
        case 'max':
          return values.every((value): value is number => typeof value === 'number')
            ? Math.max(...values)
            : undefined;
        case 'boolToNumber':
          return typeof values[0] === 'boolean' ? (values[0] ? 1 : 0) : undefined;
        default:
          return undefined;
      }
    }
    case 'seatAgg': {
      const seatIds = resolveSeatAggOver(input.def, input.state, expr.over, input.seatId);
      if (seatIds === undefined || seatIds.length === 0) {
        return seatIds === undefined ? undefined : expr.aggOp === 'count' || expr.aggOp === 'sum' ? 0 : undefined;
      }
      const values: number[] = [];
      let anyUnavailable = false;
      const collectSeatValue = (currentSeatContext: string, collect: boolean): void => {
        const value = evaluateDynamicCandidateFeatureExpr(input, expr.expr, candidateIndex, currentSeatContext);
        if (typeof value === 'number') {
          if (collect) {
            values.push(value);
          }
        } else {
          anyUnavailable = true;
        }
      };
      if ((expr.availability ?? 'skipUnavailable') === 'selfAndTargetReady' && !seatIds.includes(input.seatId)) {
        collectSeatValue(input.seatId, false);
      }
      for (const currentSeatId of seatIds) {
        collectSeatValue(currentSeatId, true);
      }
      if ((expr.availability === 'requireAllReady' || expr.availability === 'selfAndTargetReady') && anyUnavailable) {
        return undefined;
      }
      if (expr.aggOp === 'count') {
        return values.length;
      }
      if (values.length === 0) {
        return expr.aggOp === 'sum' && !anyUnavailable ? 0 : undefined;
      }
      switch (expr.aggOp) {
        case 'sum':
          return values.reduce((total, value) => total + value, 0);
        case 'min':
          return Math.min(...values);
        case 'max':
          return Math.max(...values);
      }
      return undefined;
    }
    default:
      return undefined;
  }
};

export const evaluateDynamicCandidateFeatureRows = (
  input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly seatId: string;
    readonly candidateCount: number;
  },
  expr: CompiledPolicyExpr,
  rows: readonly PolicyWasmPrecomputedDynamicCandidateFeature[],
): readonly PolicyValue[] | null => {
  if (expr.kind !== 'seatAgg') {
    return null;
  }
  const dynamicRows = dynamicCandidateFeatureByCode(rows);
  return Array.from({ length: input.candidateCount }, (_, candidateIndex) =>
    evaluateDynamicCandidateFeatureExpr({ ...input, dynamicRows }, expr, candidateIndex));
};
