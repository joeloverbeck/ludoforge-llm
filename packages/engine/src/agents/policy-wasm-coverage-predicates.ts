import type {
  AgentPolicyCatalog,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  GameDef,
} from '../kernel/types.js';
import { previewDynamicRefCode } from './policy-wasm-dynamic-candidate-feature-rows.js';

/*
 * Spec 206 shared WASM coverage predicates.
 *
 * These pure helpers decide which preview-cost candidate-feature expression
 * shapes the WASM score-row route can materialize. They were lifted out of
 * `policy-wasm-score-routing.ts` so the route AND the standing coverage
 * classifier (`policy-wasm-coverage-classifier.ts`) consult a single source of
 * truth — a ref family added to the TS evaluator without a paired WASM decision
 * is exactly the gap Spec 206 closes (Foundation #15, the paired-contract
 * pattern Spec 154 established).
 *
 * Behavior is identical to the prior in-route definitions; only the location
 * changed (no compatibility alias is retained — Foundation #14).
 */

/**
 * Collects the preview-dynamic refs the production preview drive can
 * materialize into fixed slots: `previewSurface` refs and
 * `library`/`previewStateFeature` refs. Other ref kinds (notably
 * `previewRelationship` and `currentSurface`) are intentionally NOT collected;
 * the route and the classifier treat them as un-materializable by this path.
 */
export const collectPreviewDynamicRefs = (expr: CompiledPolicyExpr): readonly CompiledAgentPolicyRef[] => {
  const refs: CompiledAgentPolicyRef[] = [];
  const visit = (current: CompiledPolicyExpr | undefined): void => {
    if (current === undefined) {
      return;
    }
    switch (current.kind) {
      case 'literal':
      case 'param':
        return;
      case 'ref':
        if (
          current.ref.kind === 'previewSurface'
          || (current.ref.kind === 'library' && current.ref.refKind === 'previewStateFeature')
        ) {
          refs.push(current.ref);
        }
        return;
      case 'op':
        current.args.forEach(visit);
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') visit(current.zone);
        return;
      case 'globalTokenAgg':
      case 'globalZoneAgg':
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') visit(current.anchorZone);
        return;
      case 'seatAgg':
        visit(current.expr);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') visit(current.zone);
        return;
    }
  };
  visit(expr);
  const seen = new Set<number>();
  return refs.filter((ref) => {
    const code = previewDynamicRefCode(ref);
    if (seen.has(code)) {
      return false;
    }
    seen.add(code);
    return true;
  });
};

/**
 * Resolves the fixed preview-state slot names a collected preview-dynamic ref
 * reads. Returns `undefined` when the ref shape cannot be reduced to fixed
 * slots (e.g. a `victoryCurrentMargin`/`Rank` ref without a role selector, or a
 * `previewStateFeature` whose underlying state feature is absent from the
 * catalog). A `undefined`/empty result forces the route — and the classifier —
 * to treat the feature as TS-oracle-only.
 */
export const previewGlobalSlotsForRef = (
  catalog: AgentPolicyCatalog,
  def: GameDef,
  ref: CompiledAgentPolicyRef,
  seatContextIds: readonly string[] = [],
): readonly string[] | undefined => {
  if (ref.kind === 'previewSurface') {
    if (ref.family === 'globalVar' && ref.selector === undefined) {
      return [`global.${ref.id}`];
    }
    if (ref.family === 'victoryCurrentMargin' || ref.family === 'victoryCurrentRank') {
      if (ref.selector?.kind !== 'role') {
        return undefined;
      }
      const seatTokens = ref.selector.seatToken === '$seat'
        ? seatContextIds
        : [ref.selector.seatToken];
      return [
        ...seatTokens.map((seatToken) => `surface.${ref.family}.${seatToken}`),
        ...def.globalVars.map((variable) => `global.${variable.name}`),
      ];
    }
    return undefined;
  }
  if (ref.kind !== 'library' || ref.refKind !== 'previewStateFeature') {
    return undefined;
  }
  const feature = catalog.compiled.stateFeatures[ref.id];
  const exprRef = feature?.expr.kind === 'ref' ? feature.expr.ref : undefined;
  if (exprRef?.kind === 'currentSurface' && exprRef.family === 'globalVar' && exprRef.selector === undefined) {
    return [`global.${exprRef.id}`];
  }
  return feature === undefined
    ? undefined
    : [`feature.${ref.id}`, ...def.globalVars.map((variable) => `global.${variable.name}`)];
};
