# DECINSARC-005: Delete decision-occurrence.ts and decision-id.ts, update kernel exports

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — delete 2 legacy kernel files, remove their obsolete tests, update `index.ts`
**Deps**: DECINSARC-003, DECINSARC-004

## Problem

After DECINSARC-003 and DECINSARC-004, the legacy modules `decision-occurrence.ts` and `decision-id.ts` no longer participate in engine runtime behavior. They should be deleted so `decision-scope.ts` remains the sole source of truth for decision identity/occurrence semantics and so dead public exports cannot drift away from the active architecture.

## Assumption Reassessment (2026-03-13)

1. `packages/engine/src/kernel/decision-occurrence.ts` has no production consumers. Its only live references are:
   - `packages/engine/src/kernel/index.ts` public re-export
   - `packages/engine/test/unit/kernel/decision-occurrence.test.ts`
2. `packages/engine/src/kernel/decision-id.ts` has no production consumers. Its only live reference is:
   - `packages/engine/test/unit/decision-id.test.ts`
3. The runner has already migrated to the codec. `packages/runner/src/model/iteration-context.ts` imports `parseDecisionKey` from `@ludoforge/engine/runtime`; it does not use `extractResolvedBindFromDecisionId`.
4. Modern coverage already exists for the replacement architecture:
   - `packages/engine/test/unit/kernel/decision-scope.test.ts`
   - `packages/engine/test/unit/move-runtime-bindings.test.ts`
5. The original ticket understated the work by treating this as source-only deletion. In practice, test cleanup is part of the ticket because leaving dedicated tests for deleted modules would keep stale architecture alive in verification.

## Architecture Check

1. Deleting `decision-id.ts` is strictly better than the current state. Its behavior is fully subsumed by `formatDecisionKey()`, `advanceScope()`, and `parseDecisionKey()`, so keeping it would only preserve duplicate serialization logic.
2. Deleting `decision-occurrence.ts` is also better than the current state. It represents the superseded model: mutable occurrence maps, alias fallback resolution, and legacy write helpers. Keeping that API exported conflicts with the immutable `DecisionScope` architecture described in [Spec 60](/home/joeloverbeck/projects/ludoforge-llm/specs/60-decision-instance-architecture.md).
3. The clean architecture here is:
   - one codec surface for decision identity (`decision-scope.ts`)
   - one runtime-binding surface for interpreting move params (`move-runtime-bindings.ts`)
   - no backwards-compatibility aliases or re-exports
4. The only caveat is verification: relevant invariants must live in modern tests, not in suites dedicated to deleted files.
5. Architectural note: the current engine still emits `decision:`-prefixed keys for many static authored choices. That is internally consistent today, but it is a separate architecture question from this ticket and should not block deleting the obsolete modules.

## What to Change

### 1. Delete `packages/engine/src/kernel/decision-occurrence.ts`

Entire file. No runtime consumer remains; only a stale public export and a dedicated legacy unit test still reference it.

### 2. Delete `packages/engine/src/kernel/decision-id.ts`

Entire file. `composeScopedDecisionId` is replaced by `advanceScope()` / `formatDecisionKey()`. `extractResolvedBindFromDecisionId` is replaced by `parseDecisionKey()`.

### 3. Update `packages/engine/src/kernel/index.ts`

- Remove: `export * from './decision-occurrence.js'`
- Keep `export * from './decision-scope.js'` as the sole decision-identity export surface

### 4. Remove or migrate obsolete tests

- Delete `packages/engine/test/unit/kernel/decision-occurrence.test.ts`
- Delete `packages/engine/test/unit/decision-id.test.ts`
- Strengthen modern tests where needed so any still-relevant invariants remain covered by:
  - `packages/engine/test/unit/kernel/decision-scope.test.ts`
  - `packages/engine/test/unit/move-runtime-bindings.test.ts`

### 5. Verify no remaining imports or references

- Grep engine and runner source/test trees for `decision-occurrence` or `decision-id`
- Fix any stragglers found within this ticket's scope

## Files to Touch

- `packages/engine/src/kernel/decision-occurrence.ts` (delete)
- `packages/engine/src/kernel/decision-id.ts` (delete)
- `packages/engine/src/kernel/index.ts` (modify — remove stale export)
- `packages/engine/test/unit/kernel/decision-occurrence.test.ts` (delete)
- `packages/engine/test/unit/decision-id.test.ts` (delete)
- `packages/engine/test/unit/kernel/decision-scope.test.ts` (modify only if extra coverage is needed)
- `packages/engine/test/unit/move-runtime-bindings.test.ts` (modify only if extra coverage is needed)

## Out of Scope

- Modifying effect execution files (done in DECINSARC-003)
- Modifying move construction or legal-choices (done in DECINSARC-004)
- Broad test-helper rewrites across the engine suite (DECINSARC-006)
- Modifying runner source files unless a real deletion blocker is found
- Any game-specific changes

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` passes
2. Targeted engine unit coverage for the modern replacement surfaces passes
3. `pnpm turbo typecheck` passes
4. `pnpm turbo lint` passes
5. `rg "decision-occurrence|decision-id" packages/engine packages/runner` returns no live source/test references except intentional historical mentions outside code

### Invariants

1. `decision-scope.ts` is the sole source of truth for decision identity and scope operations.
2. No backwards-compatibility re-exports of deleted module symbols remain.
3. No dead imports remain in engine or runner code/tests.
4. Coverage for decision identity/binding behavior lives in modern suites, not tests dedicated to deleted modules.

## Test Plan

### New/Modified Tests

1. Delete `packages/engine/test/unit/kernel/decision-occurrence.test.ts` — removes tests for a deleted legacy API
2. Delete `packages/engine/test/unit/decision-id.test.ts` — removes tests for duplicate serialization helpers replaced by the codec
3. Strengthen `packages/engine/test/unit/kernel/decision-scope.test.ts` if needed to preserve decision-key formatting / parsing invariants
4. Strengthen `packages/engine/test/unit/move-runtime-bindings.test.ts` if needed to preserve binding-derivation invariants

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="decision-scope|move runtime bindings"`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-13
- What actually changed:
  - deleted `packages/engine/src/kernel/decision-occurrence.ts`
  - deleted `packages/engine/src/kernel/decision-id.ts`
  - removed the stale `decision-occurrence` re-export from `packages/engine/src/kernel/index.ts`
  - deleted the legacy unit suites tied to those removed modules
  - strengthened `packages/engine/test/unit/kernel/decision-scope.test.ts` to keep the still-relevant first-occurrence / repeated-occurrence invariant covered by the modern codec suite
  - renamed two stale `decision-id` test descriptions in `packages/engine/test/unit/decision-param-helpers.test.ts` to `decision-key`
- Deviations from original plan:
  - the original ticket assumed source-only deletion; in reality the dedicated legacy tests also had to be removed as part of the same ticket
  - the original ticket assumed runner migration was still pending; verification showed the runner was already on `parseDecisionKey`
  - no change to runner source was required
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed with pre-existing warnings only
  - `rg -n "decision-occurrence|decision-id" packages/engine packages/runner` returned no live code/test references
