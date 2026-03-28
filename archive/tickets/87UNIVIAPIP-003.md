# 87UNIVIAPIP-003: Thread enumeration discovery cache through legal-move enumeration and classification

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `kernel/legal-moves.ts`, `kernel/apply-move.ts`
**Deps**: archive/tickets/87UNIVIAPIP-001.md

## Problem

`move-decision-sequence.ts` already supports both halves of the cache contract introduced by the earlier Spec 87 tickets:

- `MoveDecisionSequenceSatisfiabilityOptions.discoverer`
- `ResolveMoveDecisionSequenceOptions.discoveryCache`
- `DiscoveryCache = Map<Move, ChoiceRequest>`

What is still missing is the wiring in the legal-move pipeline:

- enumeration does not create a per-call discovery cache
- same-state enumeration admission checks do not populate that cache
- classification does not pass the cache into `probeMoveViability`

That leaves `legalChoicesDiscover(def, state, move)` duplicated between enumeration and classification for the same move object in the same state.

## Assumption Reassessment (2026-03-27)

1. `move-decision-sequence.ts` already exports `DiscoveryCache`, already accepts `discoverer` in satisfiability classification, and already accepts `discoveryCache` in `resolveMoveDecisionSequence`. This ticket must not reimplement those types/options.
2. `enumerateRawLegalMoves` currently returns only `{ moves, warnings }`. Extending its private return type with `discoveryCache` is safe because the helper is module-private and `legalMoves()` still reads only `.moves`.
3. `legal-moves.ts` has five relevant decision-sequence admission/classification call sites, not four:
   - plain-action feasibility probe in `enumerateParams` on the root `state`
   - free-operation admission via `classifyMoveDecisionSequenceAdmissionForLegalMove` on derived `candidateState`
   - free-operation admission via `isMoveDecisionSequenceAdmittedForLegalMove` on derived `candidateScopedState`
   - event admission in `enumerateCurrentEventMoves` on the root `state`
   - pipeline admission in `enumerateRawLegalMoves` on the root `state`
4. Only the root-state call sites are safe cache producers for later classification reuse. The free-operation paths evaluate derived states and must not reuse a discoverer closed over the root `state`.
5. `applyTurnFlowWindowFilters` preserves move object identity for surviving moves, so a `Map<Move, ChoiceRequest>` keyed by move reference remains valid from enumeration into classification.
6. `classifyEnumeratedMoves` currently calls `probeMoveViability(def, state, move, runtime)` with no cache. `probeMoveViability` must be extended to accept the optional `DiscoveryCache` and pass it into `resolveMoveDecisionSequence`.

## Architecture Check

1. The right cache boundary is one `DiscoveryCache` per `enumerateRawLegalMoves` invocation. That keeps the cache scoped to a single `(def, state)` enumeration session and avoids mutating any hot-path object shape.
2. The cache key should remain the `Move` object reference, not a recomputed identity string. The pipeline already preserves surviving move references and the cache must not introduce new identity infrastructure.
3. The discoverer wrapper should only be used where the classification probe later runs against the same root `state`. Reusing root-state discovery results for free-operation derived states would be architecturally wrong.
4. The classification probe must still run. The cache only removes redundant discovery work inside `resolveMoveDecisionSequence`; it must not bypass the rest of `probeMoveViability`'s validation pipeline.
5. No backwards-compatibility aliases or dual paths. Extend the current internal API cleanly and update all callers in the same change.

## Architectural Note

The current architecture is directionally correct: classification-time discovery injection and resolve-time cache consumption are already separated in `move-decision-sequence.ts`. The missing work is not a new abstraction but consistent threading through the legal-move pipeline.

If this area needs a future refinement, the next architectural step would be a dedicated internal "legal move discovery session" object that owns budgets, warning emission, and the discovery cache in one place. That is larger than this ticket and should not be mixed into the current fix unless the existing parameter threading becomes unmaintainable during implementation.

## What to Change

### 1. Extend `RawLegalMoveEnumerationResult` with `discoveryCache`

```typescript
interface RawLegalMoveEnumerationResult {
  readonly moves: readonly Move[];
  readonly warnings: readonly RuntimeWarning[];
  readonly discoveryCache: DiscoveryCache;
}
```

### 2. Create cached discoverer in `enumerateRawLegalMoves`

Inside `enumerateRawLegalMoves`, create a `DiscoveryCache` and a cached discoverer closed over the root `(def, state, runtime)`:

```typescript
const discoveryCache: DiscoveryCache = new Map();

const cachedDiscover: DecisionSequenceChoiceDiscoverer = (move, discoverOptions) => {
  const cached = discoveryCache.get(move);
  if (cached !== undefined) return cached;
  const result = legalChoicesDiscover(def, state, move, {
    ...(discoverOptions?.onDeferredPredicatesEvaluated === undefined
      ? {}
      : { onDeferredPredicatesEvaluated: discoverOptions.onDeferredPredicatesEvaluated }),
  }, runtime);
  discoveryCache.set(move, result);
  return result;
};
```

### 3. Thread `cachedDiscover` only to same-state enumeration admission sites

Add `discoverer: cachedDiscover` to the root-state enumeration checks:

- plain-action feasibility probe in `enumerateParams`
- event admission in `enumerateCurrentEventMoves`
- pipeline admission in `enumerateRawLegalMoves`

Do **not** thread `cachedDiscover` into the free-operation admission helpers that operate on `candidateState` / `candidateScopedState`.

Threading will require updating private helper signatures so those same-state call sites can access the cached discoverer. Keep those signature changes internal to `legal-moves.ts`.

### 4. Return `discoveryCache` from `enumerateRawLegalMoves`

```typescript
return { moves: finalMoves, warnings, discoveryCache };
```

Also handle the early-return case (ineligible seat) by returning an empty Map:

```typescript
if (!isActiveSeatEligibleForTurnFlow(def, state, seatResolution)) {
  return { moves: [], warnings, discoveryCache: new Map() };
}
```

### 5. Thread the cache into classification

Update `enumerateLegalMoves` and `classifyEnumeratedMoves` so classification receives the same `discoveryCache` produced during enumeration.

### 6. Extend `probeMoveViability` to accept optional `DiscoveryCache`

`probeMoveViability` should accept an additional optional internal parameter and pass it to:

```typescript
resolveMoveDecisionSequence(def, state, move, { choose: () => undefined, discoveryCache }, runtime)
```

This is an internal kernel API change. Update all internal call sites accordingly.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify) — create cache, thread cached discoverer to root-state enumeration call sites, extend raw return type, thread cache into classification
- `packages/engine/src/kernel/apply-move.ts` (modify) — accept optional `DiscoveryCache` and pass it into `resolveMoveDecisionSequence`
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify) — add coverage for cache wiring at the enumeration/classification boundary
- `packages/engine/test/unit/kernel/apply-move.test.ts` or `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify only if needed) — cover probe/cache handoff directly if legal-moves tests are insufficient

## Out of Scope

- `move-decision-sequence.ts` structural changes — the cache hooks already exist there and should only be consumed, not redesigned
- Free-operation admission caching across derived states — that would require a different cache/session design and is intentionally excluded here
- Any hot-path object shape changes (`Move`, `MoveEnumerationState`, `ClassifiedMove`, `EffectCursor`, `ReadContext`, `GameDefRuntime`)
- `legalMoves()` behavior — it may continue ignoring `discoveryCache` and returning only `.moves`

## Acceptance Criteria

### Tests That Must Pass

1. `enumerateLegalMoves` reuses enumeration-time discovery results during classification for same-state plain/event/pipeline moves, with no behavioral change to the returned classified move set.
2. Free-operation admission paths continue to evaluate against their derived states and do not consume the root-state cached discoverer.
3. `legalMoves()` still returns the same raw move list shape and ignores the cache.
4. `pnpm -F @ludoforge/engine test` passes.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.
7. `packages/engine/test/integration/classified-move-parity.test.ts` continues to pass.

### Invariants

1. The cached discoverer calls `legalChoicesDiscover` at most once per surviving root-state `Move` object reference during enumeration.
2. The cache is scoped to a single `enumerateRawLegalMoves` invocation and discarded after the enclosing `enumerateLegalMoves` call completes.
3. No new fields are added to hot-path runtime objects.
4. Classification consumes the cache only through `probeMoveViability` → `resolveMoveDecisionSequence`; no probe validations are skipped.
5. Only same-state enumeration admission sites receive the cached discoverer; derived-state free-operation checks do not.

## Test Plan

### New/Modified Tests

1. Add or strengthen a unit test proving that `enumerateLegalMoves` can classify a move whose discovery request is cached during enumeration without changing behavior.
2. Add or strengthen a structural/AST guard in `legal-moves.test.ts` confirming that the root-state plain/event/pipeline admission calls receive `discoverer`, while the free-operation derived-state paths do not.
3. Re-run classified-move parity coverage to prove no regression in the legal-move surface.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-27
- Actual changes:
  - Threaded a per-enumeration `DiscoveryCache` through `enumerateRawLegalMoves` and `enumerateLegalMoves`.
  - Reused that cache during classification by extending `probeMoveViability` to pass it into `resolveMoveDecisionSequence`.
  - Added same-state cached-discoverer threading for root-state plain, event, and pipeline admission paths.
  - Preserved the kernel boundary by introducing an internal `move-decision-discoverer.ts` helper instead of importing `legal-choices.ts` directly into `legal-moves.ts`.
  - Added direct probe-cache coverage and legal-moves AST wiring guards.
- Deviations from original plan:
  - `move-decision-sequence.ts` already had the `discoverer` and `discoveryCache` option hooks, so this ticket implemented only the missing pipeline wiring.
  - The final architecture did not export a new helper from `move-decision-sequence.ts`; the helper was moved to a separate internal module to preserve the existing public export surface and satisfy architecture guards.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
