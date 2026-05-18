# 181STRSTRPOL-007: Phase 1 — Runtime selector evaluation + caching

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/agents/policy-eval.ts`, possibly new `packages/engine/src/agents/policy-selector-eval.ts`
**Deps**: `archive/tickets/181STRSTRPOL-006.md`

## Problem

Ticket 006 lands the selector IR and compiler diagnostics, but no runtime can resolve `selector.<id>.selected.quality` or similar refs yet. This ticket implements the runtime evaluator: source materialisation, `where`-filtering, `quality.components` scoring, `minImpact` checks, `result` ordering / truncation, caching, and ref-resolution wiring so existing considerations can read selector outputs as if they were features.

## Assumption Reassessment (2026-05-18)

1. The two-phase policy evaluation pipeline from Spec 121 lives in `packages/engine/src/agents/policy-eval.ts` (`evaluatePhase1`, `evaluatePhase2`). State-cost selectors evaluate in phase 1; candidate/microturn/preview-cost selectors in phase 2. Confirmed by Step 2 verification this session.
2. Ref resolution goes through `policy-evaluation-core.ts` (`evaluateExpr`, ref lookup tables). Adding selector refs follows the same pattern as existing feature/aggregate/standing-role ref resolution.
3. Selector source iteration depends on game-state-accessor primitives — `state.zones`, `state.tokens`, `state.cards`, `state.players` — which are already available to feature evaluators. No new state accessors needed.
4. Caching: per-decision evaluation already caches state features and aggregates. Selectors join the same cache layer.

## Architecture Check

1. Selector evaluation is pure: inputs (state, candidate, preview status snapshot) → output (`SelectedSelectorView`). Deterministic (Foundation #8).
2. Quality computation is integer arithmetic only (`Math.trunc` for any division if needed; weights are integers); ordering uses stable tie-breakers (Foundation #8).
3. Selectors do not trigger additional preview drives — components reading preview refs consume already-published values from the existing preview infrastructure. If a needed ref is unpublished, the runtime returns `unavailable` with the declared `previewFallback`, matching Foundation #20.
4. Pair-selector truncation is deterministic (left.stableKeyAsc, right.stableKeyAsc, truncate at `maxPairs`); emits `POLICY_SELECTOR_PRODUCT_TRUNCATED` advisory the first time per `(decisionId, selectorId)`.
5. Cache invalidation matches the existing per-decision lifecycle; no cross-decision aliasing (Foundation #11 immutability).

## What to Change

### 1. Selector evaluator module

New `packages/engine/src/agents/policy-selector-eval.ts` exporting:

```ts
export type SelectedSelectorView = {
  readonly selectorId: SelectorId;
  readonly selected: ReadonlyArray<SelectedItem>;   // truncated by result.maxItems
  readonly impactSatisfied: boolean;                // minImpact evaluated against best item
  readonly emptyReason?: 'whereExcludedAll' | 'sourceEmpty' | 'minImpactFailed';
};

export type SelectedItem = {
  readonly key: string;                              // stable
  readonly quality: number;
  readonly rank: number;                             // 1-based
  readonly components: ReadonlyMap<ComponentId, number>;
};

export function evaluateSelector(
  selectorDef: SelectorDef,
  ctx: SelectorEvalContext,
): SelectedSelectorView;
```

`SelectorEvalContext` carries: state, candidate-if-candidate-scoped, microturn-options-if-microturn-scoped, preview-status-snapshot, the existing ref-resolution facade.

### 2. Source materialisation

For each `SelectorSource.kind`, produce an iterable of `(key, payload)` pairs:

- `'collection'`: enumerate the canonical collection from state (`state.zones.entries()`, etc.).
- `'product'`: cartesian product `left × right`, ordered by `left.stableKeyAsc, right.stableKeyAsc`, truncated at `maxPairs` (emit `POLICY_SELECTOR_PRODUCT_TRUNCATED` advisory once).
- `'microturnOptions'`: enumerate `ctx.microturnOptions` (must be present; runtime error otherwise — caught by compiler scope check in 006 but defence-in-depth here).
- `'candidateParams'`: enumerate `ctx.candidate.params[param]`.

### 3. `where`, quality, `minImpact`

Filter by `where`. Score each survivor by `quality.components`:
- Each component evaluates `value` via the existing `evaluateExpr` pipeline.
- If value is `undefined` (preview unavailable), apply `previewFallback.onUnavailable` (e.g., `'noContribution'` zeroes that component; `'unknownContribution'` may propagate).
- Sum `component.value * component.weight` per item.

Apply `result.order` deterministically; truncate at `maxItems`.

Evaluate `minImpact` against the best (rank-1) item if any survived; `impactSatisfied` is the boolean.

### 4. Ref-resolution wiring

In `policy-evaluation-core.ts`, extend the ref-resolution table to recognise:

- `selector.<id>.selected.matches` → `view.selected.length > 0`
- `selector.<id>.selected.key` → `view.selected[0]?.key`
- `selector.<id>.selected.quality` → `view.selected[0]?.quality`
- `selector.<id>.selected.rank` → `view.selected[0]?.rank` (always 1 by construction)
- `selector.<id>.selected.component.<componentId>` → `view.selected[0]?.components.get(componentId)`
- `selector.<id>.impactSatisfied` → `view.impactSatisfied`
- `selector.<id>.candidate.<key>.quality` → `view.selected.find(s => s.key === key)?.quality` (only meaningful inside candidate iteration; compiler enforces scope)
- `selector.<id>.size` → `view.selected.length`

`undefined` returns honour the existing preview-unavailability semantics (no silent coercion to 0; consumers must declare fallback).

### 5. Caching

Per-decision cache keyed by `(decisionId, selectorId, candidateIdIfCandidateScoped, previewStatusHash)`. Selector evaluates at most once per cache key per decision. Cache lifecycle matches the existing per-decision policy-evaluation lifecycle in `policy-eval.ts`.

### 6. Phase routing

In `policy-eval.ts`:
- `costClass: 'state'` → evaluate during `evaluatePhase1` (once per decision).
- `costClass: 'candidate' | 'microturn' | 'preview'` → evaluate during `evaluatePhase2` (per candidate).
- `costClass: 'auditOnly'` → skip during normal scoring; reserved for future audit-mode probes.

### 7. `onEmpty` semantics

When the selected set is empty after `where`/`minImpact`:
- `'noContribution'`: silent zero downstream refs (return `undefined` per Foundation #20).
- `'traceAndNoContribution'`: emit `POLICY_SELECTOR_EMPTY` advisory + zero downstream refs.
- `'demote'`: apply a configurable penalty (default −100 unless author overrides via a profile-level setting; revisit during ARVN migration if the default proves wrong) to candidates whose `where` matched.

## Files to Touch

- `packages/engine/src/agents/policy-selector-eval.ts` (new)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — ref-resolution extension)
- `packages/engine/src/agents/policy-eval.ts` (modify — phase routing + cache lifecycle)
- `packages/engine/test/agents/policy-selector-eval.test.ts` (new — evaluator unit tests)
- `packages/engine/test/determinism/agent-selector-determinism.test.ts` (new — replay-identity test for a selector-using profile)

## Out of Scope

- Trace integration (008 owns the `selectors` field on `PolicyAgentDecisionTrace`).
- Conformance tests across games (009, 010, 011).
- ARVN consideration migration (012).

## Acceptance Criteria

### Tests That Must Pass

1. `policy-selector-eval.test.ts` — happy-path: a selector with a single component over `state.zones` produces the expected ranked output for a fixture state.
2. `policy-selector-eval.test.ts` — pair selector: `(zones × zones)` product produces deterministic truncation at `maxPairs`; advisory emitted once.
3. `policy-selector-eval.test.ts` — `onEmpty` semantics: each of `noContribution` / `traceAndNoContribution` / `demote` is exercised.
4. `policy-selector-eval.test.ts` — preview unavailable: component reading an unpublished preview ref returns `unavailable`; `previewFallback: noContribution` zeroes contribution without silent coercion.
5. `agent-selector-determinism.test.ts` — two consecutive runs of a selector-using profile at the same seed produce bit-identical decision streams (Foundation #8).
6. `policy-selector-eval.test.ts` — phase routing: state-cost selectors evaluate once per decision (verify via cache hit count); candidate-cost selectors evaluate per candidate.
7. Existing suite: `pnpm turbo test`

### Invariants

1. Selector evaluation is pure (Foundation #8, #11).
2. Same inputs → same selected ordering (stable key tie-breaker mandatory).
3. Preview-unavailable components do NOT silently coerce to 0 (Foundation #20).
4. No new preview drives triggered by selector evaluation (Foundation #10).
5. Cache invalidates per-decision; no cross-decision aliasing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-selector-eval.test.ts` — evaluator unit tests covering all source kinds, all `onEmpty` modes, all cost classes, preview-unavailable.
2. `packages/engine/test/determinism/agent-selector-determinism.test.ts` — replay-identity for a selector-using profile.

### Commands

1. `pnpm -F @ludoforge/engine test -- policy-selector`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
