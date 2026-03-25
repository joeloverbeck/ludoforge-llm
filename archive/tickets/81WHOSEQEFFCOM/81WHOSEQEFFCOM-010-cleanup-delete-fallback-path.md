# 81WHOSEQEFFCOM-010: Cleanup — delete fallback path, assert 100% coverage

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — effect-compiler.ts, effect-compiler-codegen.ts, effect-compiler-patterns.ts, lifecycle runtime tests
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md, archive/tickets/81WHOSEQEFFCOM-002-variable-binding-leaf-effects.md, archive/tickets/81WHOSEQEFFCOM-003-marker-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-004-turn-flow-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-005-token-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-006-iteration-reduction-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-007-information-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-008-complex-control-flow-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-009-lifecycle-choice-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-011-delegate-leaf-wrapper-consolidation.md

## Problem

Once all 33 lifecycle effect types have compiled closures (tickets 001-009), the fallback path (`createFallbackFragment`, `fallbackBatch` accumulation in `compileFragmentList`) is dead code. Per Foundation 9 (No Backwards Compatibility), this dead code must be deleted — no shim, no alias, no deprecated fallback path. Additionally, CI-level assertions must enforce 100% coverage ratio for all lifecycle effect sequences.

## Assumption Reassessment (2026-03-25)

1. `createFallbackFragment` exists in `effect-compiler.ts` and still bridges compiled lifecycle execution back into `applyEffectsWithBudgetState`.
2. `compileFragmentList` in `effect-compiler.ts` still batches `classifyEffect(...) === null` nodes into `fallbackBatch`, so top-level lifecycle compilation is not yet total.
3. There is a second fallback seam in `effect-compiler-codegen.ts`: `BodyCompiler` is nullable and `executeEffectList(...)` re-enters the interpreter whenever a nested body fragment is `null`.
4. `computeCoverageRatio` in `effect-compiler-patterns.ts` still reports partial coverage, and `CompiledEffectSequence.coverageRatio` is still part of the public compiled-lifecycle contract used by verification/runtime diagnostics.
5. `grantFreeOperation` (tag 22) is explicitly excluded from `classifyEffect` today by returning `null`; no lifecycle-specific hard failure exists yet.
6. The interpreter (`applyEffects` pipeline) remains needed for: (a) action effects, including `grantFreeOperation`; (b) verification-mode comparison against compiled lifecycle execution; (c) non-lifecycle execution paths.
7. Texas Hold'em production data contains `onEnter` lifecycle sequences. FITL production data currently contains no `onEnter` / `onExit` sequences at all, so FITL production coverage assertions are vacuous unless the test first asserts that zero-lifecycle baseline.
8. Existing tests still encode the fallback-era architecture: `effect-compiler.test.ts` imports/tests `createFallbackFragment`, and `compiled-lifecycle-runtime.test.ts` asserts that FITL currently compiles no lifecycle entries.
9. Verified against live production fixtures during implementation: Texas production still contains lifecycle `if` nodes that hit `_k === EFFECT_KIND_TAG.if` but do **not** produce a compilable descriptor from `matchIf(...)`. The old fallback path currently masks that descriptor-level gap.

## Architecture Check

1. Deleting lifecycle fallback is architecturally correct only once lifecycle compilation is total at the descriptor level, not merely at the effect-kind level. The live Texas production fixture proves that this ticket's original assumption was too optimistic: some lifecycle `if` nodes still fail descriptor classification even though `_k === if` is nominally "supported".
2. Cleanup must be comprehensive, not partial: remove both the top-level fallback batch in `effect-compiler.ts` and the nested-body fallback in `effect-compiler-codegen.ts`. Keeping either path would preserve the same architectural weakness under a different shape.
3. `grantFreeOperation` should no longer signal "not compilable" through a silent `null` classification when the caller is compiling lifecycle effects. Lifecycle compilation should fail loudly with a descriptive error because this is an invalid authoring/runtime state, not a recoverable optimization miss.
4. `composeFragments` itself is already compiled-only orchestration. The real simplification target is the compiler/codegen contract around fragment production and nested-body execution.
5. Production coverage checks should reflect the real fixtures: Texas lifecycle sequences should assert `coverageRatio === 1.0`; FITL production should assert that there are no lifecycle sequences to compile. If a FITL lifecycle fixture is needed to exercise cross-game behavior, add an explicit targeted fixture rather than pretending production FITL already contains lifecycle blocks.
6. Keeping `coverageRatio` for now is acceptable because verification/runtime diagnostics already depend on it. Removing it in this ticket is optional only if every consumer is cleaned up in the same change and the resulting diagnostics remain equally useful.
7. Before this cleanup lands, the delegate-style compiled leaf wrappers introduced in earlier tickets should already be consolidated behind a shared helper. That work is explicitly tracked in `archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-011-delegate-leaf-wrapper-consolidation.md`. Ticket 010 is not the place to introduce that helper for the first time; at most it should remove dead/superseded fallback-era plumbing left after tickets 004-011.
8. The remaining public-contract asymmetry where `applyEffects` / `applyEffect` drop `decisionScope` on successful completion is a separate runtime contract issue. It is tracked in `tickets/81WHOSEQEFFCOM-012-decision-scope-contract-alignment.md` and must not be folded into this cleanup.
9. Because of the verified Texas production blocker above, this ticket cannot be completed safely unless its scope expands to close the remaining descriptor-classification gaps first, or the cleanup is split into a prerequisite ticket plus this deletion ticket.

## What to Change

### 1. Delete `createFallbackFragment`

In `effect-compiler.ts`, remove the `createFallbackFragment` function entirely. Remove all imports and references to it.

Prerequisite: only after every lifecycle node in production fixtures classifies into a compiled descriptor.

### 2. Delete `fallbackBatch` accumulation in `compileFragmentList`

In `effect-compiler.ts`, remove the batch accumulation logic that groups uncompilable effects for fallback fragment creation. After this change, `compileFragmentList` should require a compiled descriptor/fragment for every lifecycle effect node it encounters.

Prerequisite: production lifecycle fixtures must no longer contain descriptor-classification misses.

### 3. Delete nested-body interpreter fallback

In `effect-compiler-codegen.ts`, make `BodyCompiler` total for lifecycle compilation and remove `executeEffectList(...)`'s `fragment === null` interpreter path. Nested `if` / `forEach` / `reduce` / `removeByPriority` / `let` / `evaluateSubset` bodies must execute as compiled fragments only.

### 4. Add runtime assertion for invalid lifecycle `grantFreeOperation`

During lifecycle compilation, when `_k === EFFECT_KIND_TAG.grantFreeOperation` is encountered, throw a descriptive error that explains it is an action-context effect and must not appear in lifecycle effect sequences.

### 5. Update production coverage/runtime assertions

In tests:
- assert `coverageRatio === 1.0` for every compiled Texas lifecycle sequence
- assert FITL production currently contributes zero lifecycle sequences, so there is nothing to compile there
- update any stale runtime tests that encoded the fallback-era baseline rather than the intended architecture

Additional prerequisite test:
- prove that Texas production lifecycle sequences classify/compile without any descriptor-level misses before deleting fallback

### 6. Simplify compiler/codegen contracts

If coverage ratio tracking is only useful during the transition, consider removing `computeCoverageRatio` and the `coverageRatio` field from `CompiledEffectSequence`. If kept for observability, ensure lifecycle compilation always produces `1.0` and that diagnostics/tests continue to prove that invariant.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler.ts` (modify — delete fallback path)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify — remove nested fallback/nullability)
- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify — support strict lifecycle classification/assertion)
- `packages/engine/src/kernel/effect-compiler-types.ts` (modify — only if `coverageRatio` is removed or contract changes)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify — remove fallback-era tests, add lifecycle hard-failure coverage)
- `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` (modify — update `grantFreeOperation` expectation if classification contract changes)
- `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts` (modify — replace stale FITL/Texas coverage assumption with current production assertions)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` or another targeted lifecycle integration suite (modify/add — verification coverage where useful)

## Out of Scope

- Deleting the interpreter itself — it remains for action effects and verification mode
- Compiling action effects or `grantFreeOperation` (future spec)
- Performance benchmarking (separate task)
- Refactoring unrelated lifecycle/runtime architecture beyond deleting fallback-era plumbing
- Modifying `phase-lifecycle.ts` verification mode
- Normalizing the public `decisionScope` return contract across interpreted and compiled execution (ticket 012)

## Acceptance Criteria

### Tests That Must Pass

1. `createFallbackFragment` is deleted — no references remain in the codebase (grep verification)
2. `fallbackBatch` accumulation code is deleted from `compileFragmentList`
3. Nested-body lifecycle fallback is deleted — no compiled lifecycle body may re-enter the interpreter because a fragment is `null`
4. Runtime assertion: `grantFreeOperation` encountered in lifecycle compilation throws a descriptive error
5. CI assertion: `coverageRatio === 1.0` for all lifecycle effect sequences in Texas Hold'em compiled GameDef
6. CI assertion: FITL production currently exposes zero lifecycle sequences, and the test names that baseline explicitly
7. Texas production lifecycle compilation no longer fails on descriptor-level `if` classification gaps
8. Verification/integration coverage for compiled lifecycle execution still passes after fallback deletion
9. All existing golden trace tests pass unchanged
10. All existing parity tests pass unchanged
11. Existing suite: `pnpm turbo test`
12. Existing suite: `pnpm turbo typecheck`

### Invariants

1. No `createFallbackFragment` function or import exists anywhere in the codebase
2. No `fallbackBatch` variable or accumulation logic exists in `compileFragmentList`
3. No nullable nested-body lifecycle execution contract remains in `effect-compiler-codegen.ts`
4. Lifecycle compilation either classifies every effect into a compiled fragment or throws immediately for invalid lifecycle `grantFreeOperation`
5. `grantFreeOperation` in lifecycle context causes a hard error, not a silent fallback
6. The interpreter (`applyEffects`) remains functional for action effects and verification mode
7. Every compiled lifecycle sequence has `coverageRatio: 1.0` (or the field is removed)
8. Texas production lifecycle sequences execute as pure compiled closure chains with zero interpreter fallback

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — Add test asserting `grantFreeOperation` in lifecycle sequence throws error
2. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — Replace `createFallbackFragment` coverage with assertions that nested lifecycle bodies compile without nullable fallback
3. `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts` — Assert Texas production coverage is 1.0 and FITL production has zero lifecycle entries
4. `packages/engine/test/integration/compiled-effects-verification.test.ts` or equivalent targeted suite — Keep verification-enabled lifecycle coverage passing after fallback deletion

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `grep -r "createFallbackFragment" packages/engine/src/` — must return zero results
5. `grep -r "fallbackBatch" packages/engine/src/` — must return zero results
6. `grep -r "executeEffectList(.*fragment === null\\|BodyCompiler = .*\\| null" packages/engine/src/kernel/` — must return zero fallback-contract hits (or equivalent focused grep)

## Outcome

Completed: 2026-03-25

What actually changed:
- Deleted lifecycle fallback at both seams: `createFallbackFragment` / `fallbackBatch` in `effect-compiler.ts` and nullable nested-body execution in `effect-compiler-codegen.ts`.
- Made lifecycle compilation total by introducing `classifyLifecycleEffect(...)`, hard-failing invalid lifecycle `grantFreeOperation`, and requiring `coverageRatio === 1.0` for compiled lifecycle sequences.
- Closed the remaining descriptor-level gaps that blocked safe fallback deletion by compiling generic `if` conditions through `evalCondition(...)` and delegating complex lifecycle `setVar` / `addVar` payloads through compiled wrappers instead of falling back to the interpreter.
- Updated unit/integration coverage so Texas production lifecycle sequences assert full coverage and FITL production explicitly asserts the current zero-lifecycle baseline.

Deviations from original plan:
- The original ticket assumed fallback deletion was pure cleanup after tickets 001-009. That assumption was false in live Texas production data. The ticket had to expand to include the remaining descriptor-classification work before fallback removal was safe.
- `CompiledEffectSequence.coverageRatio` was retained rather than removed because it is still useful for runtime/verification diagnostics and now acts as an enforced invariant.
- `packages/engine/src/kernel/effect-compiler-types.ts` was not changed because the public contract stayed valid once full lifecycle coverage was enforced.

Verification results:
- `pnpm -F @ludoforge/engine lint`
- `node --test packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/unit/kernel/effect-compiler-patterns.test.js packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/integration/compiled-lifecycle-runtime.test.js packages/engine/dist/test/integration/compiled-effects-verification.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
- Grep verification confirmed there are no remaining lifecycle fallback references for `createFallbackFragment`, `fallbackBatch`, or `executeEffectList` in the lifecycle compiler/codegen path.
