import type {
  AgentPolicyCatalog,
  AgentPolicyOperator,
  CompiledAgentProfile,
  CompiledPolicyExpr,
  GameDef,
} from '../kernel/types.js';
import {
  collectPreviewDynamicRefs,
  previewGlobalSlotsForRef,
} from './policy-wasm-coverage-predicates.js';

/*
 * Spec 206 — WASM candidate-feature coverage classifier.
 *
 * A pure, static (no game execution, no WASM module) function that, for each
 * preview-cost candidate feature on a compiled profile, decides whether the
 * WASM score-row route can materialize the feature as a fixed-slot row
 * (`wasm-row`) or must fall to the TS oracle (`ts-oracle`). The verdicts are
 * a deterministic function of the compiled feature expr plus the route's own
 * materializability predicates (`collectPreviewDynamicRefs` /
 * `previewGlobalSlotsForRef`), so the standing coverage manifest (Spec 206 §4.1)
 * stays paired with runtime reality (Foundation #15, cf. Spec 154 dispatch
 * completeness).
 *
 * This module encodes the materializability contract of the *current* WASM row
 * path. Three shapes route to the TS oracle today:
 *   - `previewRelationship` refs (dynamic preview-state role→seat resolution);
 *   - `currentSurface` refs (candidate-independent current-state leaves the row
 *     path does not yet evaluate — Spec 206 §4.2 / ticket 003 lifts this);
 *   - role-selected `seatAgg` below the top level (the TS dynamic-row evaluator
 *     only enters non-top-level exprs after ticket 003), plus the unsupported
 *     bytecode operators (`clamp`/`if`/`in`/`scheduleLowerBound`).
 *
 * No game-specific identifiers appear here; any game's profile classifies
 * through the same code (Foundation #1).
 */

export type CandidateFeatureCoverage = 'wasm-row' | 'ts-oracle';

export interface CandidateFeatureCoverageVerdict {
  readonly id: string;
  readonly coverage: CandidateFeatureCoverage;
  readonly reason: string;
}

/** Bytecode operators the emitter cannot lower (`compile.ts:238-243`). */
const UNSUPPORTED_BYTECODE_OPS: ReadonlySet<AgentPolicyOperator> = new Set([
  'clamp',
  'if',
  'in',
  'scheduleLowerBound',
]);

const WASM_ROW_REASON = 'all leaves materialize on the WASM score-row path';

interface ClassifyContext {
  readonly catalog: AgentPolicyCatalog;
  readonly def: GameDef;
  readonly seatContextIds: readonly string[];
  /** Coverage of preview-cost candidate features already classified in plan order. */
  readonly verdictById: ReadonlyMap<string, CandidateFeatureCoverage>;
}

/**
 * Returns the first reason the expr is NOT WASM-row-materializable, or `null`
 * when every leaf materializes. `isTopLevel` distinguishes a top-level `seatAgg`
 * (evaluated by `evaluateDynamicCandidateFeatureRows`) from a nested one (only
 * reachable through the bytecode VM today, which cannot resolve a dynamic role).
 */
const firstUnmaterializableReason = (
  expr: CompiledPolicyExpr,
  isTopLevel: boolean,
  ctx: ClassifyContext,
): string | null => {
  switch (expr.kind) {
    case 'literal':
    case 'param':
      return null;
    case 'ref': {
      const ref = expr.ref;
      if (ref.kind === 'previewRelationship') {
        return 'preview-relationship requires preview-state role resolution';
      }
      if (ref.kind === 'currentSurface') {
        return `currentSurface ref "${ref.family}.${ref.id}" requires current-state materialization the WASM row path does not yet support`;
      }
      if (ref.kind === 'previewSurface') {
        return previewGlobalSlotsForRef(ctx.catalog, ctx.def, ref, ctx.seatContextIds) === undefined
          ? `preview-surface ref "${ref.family}.${ref.id}" has no fixed materialization slot`
          : null;
      }
      if (ref.kind === 'library' && ref.refKind === 'previewStateFeature') {
        return previewGlobalSlotsForRef(ctx.catalog, ctx.def, ref, ctx.seatContextIds) === undefined
          ? `preview state-feature ref "${ref.id}" has no fixed materialization slot`
          : null;
      }
      if (ref.kind === 'library' && (ref.refKind === 'stateFeature' || ref.refKind === 'aggregate')) {
        // Precomputed in TS and surfaced to the VM via the precomputed slices.
        return null;
      }
      if (ref.kind === 'library' && ref.refKind === 'candidateFeature') {
        return ctx.verdictById.get(ref.id) === 'wasm-row'
          ? null
          : `depends on TS-oracle candidate feature "${ref.id}"`;
      }
      return `ref kind "${ref.kind}" is not materialized by the WASM row path`;
    }
    case 'op': {
      if (UNSUPPORTED_BYTECODE_OPS.has(expr.op)) {
        return `operator "${expr.op}" requires a later VM opcode expansion and is not WASM-row-evaluable`;
      }
      for (const arg of expr.args) {
        const reason = firstUnmaterializableReason(arg, false, ctx);
        if (reason !== null) {
          return reason;
        }
      }
      return null;
    }
    case 'seatAgg': {
      const over = expr.over;
      if (typeof over === 'object' && !Array.isArray(over) && 'role' in over && !isTopLevel) {
        return 'nested role-selected seatAgg requires preview-state role resolution the WASM row path does not yet support';
      }
      return firstUnmaterializableReason(expr.expr, false, ctx);
    }
    default:
      return `expression kind "${expr.kind}" is not materialized by the WASM row path`;
  }
};

const classifyExpr = (
  expr: CompiledPolicyExpr,
  ctx: ClassifyContext,
): { readonly coverage: CandidateFeatureCoverage; readonly reason: string } => {
  // Mirror the route's materialization gate: every collected preview-dynamic ref
  // must resolve to a fixed slot, otherwise `materializePreviewDynamicRowsWithWasm`
  // returns null and the feature falls to the TS oracle.
  for (const ref of collectPreviewDynamicRefs(expr)) {
    const slots = previewGlobalSlotsForRef(ctx.catalog, ctx.def, ref, ctx.seatContextIds);
    if (slots === undefined || slots.length === 0) {
      const label = ref.kind === 'previewSurface'
        ? `${ref.family}.${ref.id}`
        : ref.kind === 'library'
          ? ref.id
          : ref.kind;
      return {
        coverage: 'ts-oracle',
        reason: `preview-dynamic ref "${label}" has no fixed materialization slot`,
      };
    }
  }
  const reason = firstUnmaterializableReason(expr, true, ctx);
  return reason === null
    ? { coverage: 'wasm-row', reason: WASM_ROW_REASON }
    : { coverage: 'ts-oracle', reason };
};

/**
 * Classifies every preview-cost candidate feature on a compiled profile. Skips
 * non-preview candidate features (they are always materialized). Classifies in
 * `plan.candidateFeatures` order so a `feature.<id>` cross-ref's target verdict
 * is known before its dependents (Spec 206 §5).
 */
export const classifyCandidateFeatureCoverage = (input: {
  readonly profile: CompiledAgentProfile;
  readonly catalog: AgentPolicyCatalog;
  readonly def: GameDef;
}): readonly CandidateFeatureCoverageVerdict[] => {
  const seatContextIds = [...(input.def.seats?.map((seat) => seat.id) ?? [])].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const verdictById = new Map<string, CandidateFeatureCoverage>();
  const verdicts: CandidateFeatureCoverageVerdict[] = [];
  for (const id of input.profile.plan.candidateFeatures) {
    const feature = input.catalog.compiled.candidateFeatures[id];
    if (feature === undefined || feature.costClass !== 'preview') {
      continue;
    }
    const verdict = classifyExpr(feature.expr, {
      catalog: input.catalog,
      def: input.def,
      seatContextIds,
      verdictById,
    });
    verdictById.set(id, verdict.coverage);
    verdicts.push({ id, coverage: verdict.coverage, reason: verdict.reason });
  }
  return verdicts;
};
