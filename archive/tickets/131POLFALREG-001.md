# 131POLFALREG-001: Remove fallback-threading from PolicyEvaluationCoreResult hot path

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts` (type, core function, wrapper, construction sites)
**Deps**: `specs/128-full-scope-draft-state.md`

## Problem

Commit `971992fc` moved fallback candidate resolution into the hot `evaluatePolicyMoveCore` path, widening the `PolicyEvaluationCoreResult` discriminated union with three fallback fields (`fallbackMove`, `fallbackStableMoveKey`, `fallbackScore`). This caused an +11.34% benchmark regression (`14090ms` → `15689ms`) due to V8 hidden class deoptimization on the widened return object — a pattern documented in `campaigns/lessons-global.jsonl` as causing 4-7% regressions.

The fix is to restore fallback candidate resolution to the outer `evaluatePolicyMove` wrapper (the colder failure path), removing the fallback fields from the hot core result type entirely.

## Assumption Reassessment (2026-04-14)

1. `PolicyEvaluationCoreResult` (lines 161-181 of `policy-eval.ts`) is a discriminated union with `kind: 'success' | 'failure'`. Both variants currently carry `fallbackMove`, `fallbackStableMoveKey`, `fallbackScore` fields — confirmed via reassessment Explore agent.
2. `evaluatePolicyMoveCore` (line 356) is exported, called at lines 699, 723 within `policy-eval.ts`. No external source-file consumers — only `evaluatePolicyMove` (the public API) is imported by `policy-agent.ts`.
3. Test consumers of `evaluatePolicyMoveCore`: `policy-eval.test.ts` (lines 2238, 2794), `policy-eval-granted-op.test.ts` (lines 278, 312, 368), `fitl-policy-agent.test.ts` (line 1216, uses wrapper).
4. `canonicalizeCandidates` (line 824) is a private helper, currently called once at line 357 inside `evaluatePolicyMoveCore`. It must be callable from the outer wrapper after this refactor.
5. In-flight tickets `128FULSCODRA-007` and `128FULSCODRA-008` exist in `tickets/` — changes must not conflict with their scope.

## Architecture Check

1. Restoring fallback resolution to the outer wrapper narrows the hot-path return shape, eliminating V8 hidden class pressure. This is the architecturally correct placement: fallback is a failure-recovery concern, not a core evaluation concern.
2. No game-specific logic is introduced — this is a pure agent-layer refactoring within `policy-eval.ts`.
3. No backwards-compatibility shims — the old fallback-threaded shape is removed entirely. All construction sites and consumers are migrated in the same change (Foundation 14).

## What to Change

### 1. Narrow `PolicyEvaluationCoreResult` type

Remove `fallbackMove`, `fallbackStableMoveKey`, and `fallbackScore` from both variants of the discriminated union. The success variant keeps `kind`, `move`, `rng`, `failure: undefined`, `metadata`. The failure variant keeps `kind`, `move`, `rng`, `failure`, `metadata`. Update the canonical shape comment above the type accordingly.

### 2. Update `evaluatePolicyMoveCore` and `failureWithMetadata`

Remove fallback field population from `failureWithMetadata` (lines ~755-765) and any other construction sites within the core function. The core function no longer extracts the first candidate as a fallback — it simply returns the failure with its metadata.

### 3. Restore fallback resolution in `evaluatePolicyMove` wrapper

In the failure branch of `evaluatePolicyMove` (lines ~728-742), instead of reading `core.fallbackMove`, resolve the fallback independently:

- Call `canonicalizeCandidates(...)` on the legal moves to get the first candidate as the fallback move. This is the pre-`971992fc` design — the wrapper owns fallback resolution on the colder failure path.
- `canonicalizeCandidates` may need to be accessible from the wrapper scope (it's currently private but in the same file, so no export needed).

### 4. Update all construction sites

Grep for all object literals producing `PolicyEvaluationCoreResult` and remove the fallback fields. The reassessment confirmed the comment at line 157 documents "All construction sites must materialize every property" — update this comment to reflect the narrowed shape.

### 5. Update tests

Update test files that assert on or construct `PolicyEvaluationCoreResult` objects:

- `test/unit/agents/policy-eval.test.ts` — remove fallback field assertions/constructions
- `test/unit/agents/policy-eval-granted-op.test.ts` — same
- `test/integration/fitl-policy-agent.test.ts` — verify fallback behavior still works end-to-end via the wrapper

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (verify only; no modification required after reassessment)
- `packages/engine/test/unit/agents/policy-eval-granted-op.test.ts` (verify only; no modification required after reassessment)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (verify only; no modification required after reassessment)

## Out of Scope

- Any Spec 128 draft-state changes — must remain intact
- Restoring Spec 127 completion-path behavior from `40a43ceb`
- Broader Spec 130 hot-path redesign
- Benchmark measurement (that is ticket 002)
- Changes to `policy-agent.ts` or any file outside `policy-eval.ts` and its tests

## Acceptance Criteria

### Tests That Must Pass

1. All existing `policy-eval.test.ts` tests pass — fallback behavior works correctly via the wrapper path
2. All existing `policy-eval-granted-op.test.ts` tests pass
3. `fitl-policy-agent.test.ts` integration tests pass — fallback scenarios produce correct moves
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. **Foundation 8 (Determinism)**: identical seeds produce identical game traces — no behavioral change, only structural refactoring of where fallback resolution occurs
2. **Foundation 11 (Immutability)**: Spec 128's scoped draft-state optimization remains fully intact
3. **Foundation 14 (No Backwards Compatibility)**: no compatibility shims for the old fallback-threaded shape
4. **V8 shape stability**: `PolicyEvaluationCoreResult` has the same fields in both success and failure variants (minus the removed fallback fields) — no polymorphic return shapes on the hot path

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — update construction sites and assertions to reflect narrowed `PolicyEvaluationCoreResult` shape; verify fallback still works via wrapper
2. `packages/engine/test/unit/agents/policy-eval-granted-op.test.ts` — same narrowed shape updates
3. `packages/engine/test/integration/fitl-policy-agent.test.ts` — verify end-to-end fallback behavior unchanged

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

**Completed**: 2026-04-14

- Narrowed `PolicyEvaluationCoreResult` back to the hot-path fields only: `kind`, `move`, `rng`, `failure`, `metadata`.
- Removed fallback candidate threading from `evaluatePolicyMoveCore(...)` and `failureWithMetadata(...)`.
- Restored fallback resolution to the colder `evaluatePolicyMove(...)` wrapper by canonicalizing legal moves there on failure.
- Reassessed the named test files and verified they already proved the owned behavior without requiring source edits.
- No schema or generated artifact changes were required.

### Verification Run

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-eval.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-eval-granted-op.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo typecheck`
7. `pnpm turbo lint`

### Boundary Notes

- Semantic correction: the owned invariant is removal of the extra fallback-threading fields from the hot core result, not literal field-type equality between success and failure variants.
- Deferred scope: benchmark measurement and any residual Spec 130 audit remain owned by `tickets/131POLFALREG-002.md` and `tickets/131POLFALREG-003.md`.
