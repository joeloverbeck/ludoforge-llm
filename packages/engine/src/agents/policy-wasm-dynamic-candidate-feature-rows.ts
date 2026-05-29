import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type { PlayerId } from '../kernel/branded.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { buildSeatResolutionIndex } from '../kernel/identity.js';
import type {
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  CompiledSurfaceRef,
  GameDef,
  GameState,
} from '../kernel/types.js';
import {
  buildPolicyVictorySurface,
  resolvePolicyStandingRoleSelector,
  resolveSurfaceRefValue,
  type PolicyVictorySurface,
  type SurfaceResolutionContext,
} from './policy-surface.js';
import type { PolicyValue } from './policy-surface.js';
import type { PolicyWasmPrecomputedDynamicCandidateFeature } from './policy-wasm-runtime.js';

/*
 * Spec 206 §4.2 — structural-unmaterializable sentinel.
 *
 * `undefined` from a leaf means "preview legitimately unavailable" and MUST be
 * coalesce-able to its fallback. A structurally-unmaterializable leaf (a ref
 * shape or op the row path cannot evaluate) is a different thing: it must abort
 * the WHOLE row to the per-row TS oracle rather than be swallowed by an
 * enclosing `coalesce` into a silently-wrong value (Foundation #8 / #20). This
 * sentinel carries that second meaning; `op`/`seatAgg` combinators propagate it
 * as a hard abort and `evaluateDynamicCandidateFeatureRows` maps any sentinel
 * result to a `null` row.
 */
const UNMATERIALIZABLE: unique symbol = Symbol('policy-wasm-row-unmaterializable');
type DynamicCandidateFeatureValue = PolicyValue | typeof UNMATERIALIZABLE;

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

interface DynamicEvalContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly seatId: string;
  readonly playerId: PlayerId;
  readonly dynamicRows: ReadonlyMap<number, PolicyWasmPrecomputedDynamicCandidateFeature>;
  /** Prior unified candidate-feature rows (preview + non-preview) for `feature.<id>` cross-refs. */
  readonly candidateFeatureRows: ReadonlyMap<string, readonly PolicyValue[]>;
  /** Resolution context for non-preview `currentSurface` leaves (candidate-independent). */
  readonly currentSurfaceContext: SurfaceResolutionContext;
}

const isUnmaterializable = (value: DynamicCandidateFeatureValue): value is typeof UNMATERIALIZABLE =>
  value === UNMATERIALIZABLE;

const evaluateDynamicCandidateFeatureExpr = (
  input: DynamicEvalContext,
  expr: CompiledPolicyExpr,
  candidateIndex: number,
  seatContext?: string,
): DynamicCandidateFeatureValue => {
  switch (expr.kind) {
    case 'literal':
      return expr.value === null ? undefined : expr.value;
    case 'param':
      // params are not threaded into the row path; abort to the bytecode/oracle.
      return UNMATERIALIZABLE;
    case 'ref': {
      const ref = expr.ref;
      if (
        ref.kind === 'previewSurface'
        || (ref.kind === 'library' && ref.refKind === 'previewStateFeature')
      ) {
        const row = input.dynamicRows.get(previewDynamicRefCode(ref));
        if (row === undefined) {
          return undefined;
        }
        return seatContext === undefined
          ? row.values[candidateIndex]
          : row.seatContextValues?.[seatContext]?.[candidateIndex];
      }
      if (ref.kind === 'currentSurface') {
        // Candidate-independent function of the CURRENT state (Spec 206 §4.2).
        return resolveSurfaceRefValue(
          input.state,
          ref,
          input.seatId,
          input.playerId,
          input.currentSurfaceContext,
          seatContext,
        );
      }
      if (ref.kind === 'library' && ref.refKind === 'candidateFeature') {
        const row = input.candidateFeatureRows.get(ref.id);
        // An absent cross-ref row means the dependency was oracle-only (or not yet
        // materialized): abort the whole row rather than coalesce a wrong value.
        return row === undefined ? UNMATERIALIZABLE : row[candidateIndex];
      }
      // stateFeature / aggregate / any other ref kind is not materialized by the
      // row path; abort to the bytecode/oracle.
      return UNMATERIALIZABLE;
    }
    case 'op': {
      const values = expr.args.map((arg) =>
        evaluateDynamicCandidateFeatureExpr(input, arg, candidateIndex, seatContext));
      if (values.some(isUnmaterializable)) {
        return UNMATERIALIZABLE;
      }
      const ready = values as readonly PolicyValue[];
      switch (expr.op) {
        case 'coalesce':
          return ready.find((value) => value !== undefined);
        case 'add':
          return ready.every((value): value is number => typeof value === 'number')
            ? ready.reduce((total, value) => total + value, 0)
            : undefined;
        case 'sub':
          return typeof ready[0] === 'number' && typeof ready[1] === 'number'
            ? ready[0] - ready[1]
            : undefined;
        case 'mul':
          return ready.every((value): value is number => typeof value === 'number')
            ? ready.reduce((total, value) => total * value, 1)
            : undefined;
        case 'div':
          return typeof ready[0] === 'number' && typeof ready[1] === 'number' && ready[1] !== 0
            ? Math.trunc(ready[0] / ready[1])
            : undefined;
        case 'min':
          return ready.every((value): value is number => typeof value === 'number')
            ? Math.min(...ready)
            : undefined;
        case 'max':
          return ready.every((value): value is number => typeof value === 'number')
            ? Math.max(...ready)
            : undefined;
        case 'boolToNumber':
          return typeof ready[0] === 'boolean' ? (ready[0] ? 1 : 0) : undefined;
        default:
          // Unsupported op (e.g. clamp/if/in/scheduleLowerBound, comparisons):
          // abort to the bytecode/oracle rather than coerce to undefined.
          return UNMATERIALIZABLE;
      }
    }
    case 'seatAgg': {
      const seatIds = resolveSeatAggOver(input.def, input.state, expr.over, input.seatId);
      if (seatIds === undefined || seatIds.length === 0) {
        return seatIds === undefined ? undefined : expr.aggOp === 'count' || expr.aggOp === 'sum' ? 0 : undefined;
      }
      const values: number[] = [];
      let anyUnavailable = false;
      let aborted = false;
      const collectSeatValue = (currentSeatContext: string, collect: boolean): void => {
        const value = evaluateDynamicCandidateFeatureExpr(input, expr.expr, candidateIndex, currentSeatContext);
        if (isUnmaterializable(value)) {
          aborted = true;
          return;
        }
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
      if (aborted) {
        return UNMATERIALIZABLE;
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
        default:
          return UNMATERIALIZABLE;
      }
    }
    default:
      // zoneTokenAgg / globalTokenAgg / globalZoneAgg / adjacentTokenAgg / zoneProp:
      // not materialized by the row path; abort to the bytecode/oracle.
      return UNMATERIALIZABLE;
  }
};

const buildCurrentSurfaceContext = (
  def: GameDef,
  state: GameState,
  runtime: GameDefRuntime | undefined,
): SurfaceResolutionContext => {
  let cachedVictorySurface: PolicyVictorySurface | undefined;
  return {
    def,
    seatResolutionIndex: buildSeatResolutionIndex(def, state.playerCount),
    resolveDerivedMetric: (metricState, metricId) => computeDerivedMetricValue(def, metricState, metricId),
    resolveVictorySurface: (victoryState) => {
      // Candidate-independent: the production preview drive evaluates a single
      // current state, so the victory surface is computed at most once per row set.
      cachedVictorySurface ??= buildPolicyVictorySurface(def, victoryState, runtime);
      return cachedVictorySurface;
    },
  };
};

export const evaluateDynamicCandidateFeatureRows = (
  input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly seatId: string;
    readonly playerId: PlayerId;
    readonly candidateCount: number;
    readonly candidateFeatureRows: ReadonlyMap<string, readonly PolicyValue[]>;
    readonly runtime?: GameDefRuntime;
  },
  expr: CompiledPolicyExpr,
  rows: readonly PolicyWasmPrecomputedDynamicCandidateFeature[],
): readonly PolicyValue[] | null => {
  const context: DynamicEvalContext = {
    def: input.def,
    state: input.state,
    seatId: input.seatId,
    playerId: input.playerId,
    dynamicRows: dynamicCandidateFeatureByCode(rows),
    candidateFeatureRows: input.candidateFeatureRows,
    currentSurfaceContext: buildCurrentSurfaceContext(input.def, input.state, input.runtime),
  };
  const values: PolicyValue[] = [];
  for (let candidateIndex = 0; candidateIndex < input.candidateCount; candidateIndex += 1) {
    const value = evaluateDynamicCandidateFeatureExpr(context, expr, candidateIndex);
    if (isUnmaterializable(value)) {
      // A structurally-unmaterializable leaf aborts the whole row to the per-row
      // TS oracle (or the bytecode VM fallback) — never a silently-wrong value.
      return null;
    }
    values.push(value);
  }
  return values;
};
