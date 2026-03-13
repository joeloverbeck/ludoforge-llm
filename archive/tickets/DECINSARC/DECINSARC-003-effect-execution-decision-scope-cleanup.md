# DECINSARC-003: Finish effect-execution DecisionScope cleanup and regression coverage

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — mostly tests and helper cleanup; runtime changes only if a real gap remains
**Deps**: DECINSARC-001

## Problem

The original ticket assumed effect execution still needed a broad migration from legacy occurrence/threading helpers to `DecisionScope`. That assumption is no longer true.

As of 2026-03-13, the choice and dispatch runtime is already substantially on the target architecture from [specs/60-decision-instance-architecture.md](/home/joeloverbeck/projects/ludoforge-llm/specs/60-decision-instance-architecture.md):

- `effects-choice.ts` already uses `advanceScope()` and `decisionKey`
- `effect-dispatch.ts` already threads `decisionScope` and seeds `emptyScope()` at top-level entry points
- `effect-context.ts` already requires `decisionScope` on runtime contexts

What remains valuable in this ticket is narrower:

1. verify the remaining control-flow scope plumbing is clean and justified
2. remove stale assumptions from the ticket itself
3. add the missing regression tests that prove the architecture actually holds under sequencing and iteration

The runtime should not be rewritten again just because the original ticket said so. If a part is already architecturally correct, keep it.

## Assumption Reassessment (2026-03-13)

1. `packages/engine/src/kernel/effects-choice.ts` no longer depends on `decision-occurrence.ts` or `decision-id.ts` for `chooseOne`, `chooseN`, or `rollRandom`.
   - `applyChooseOne()` already calls `advanceScope(...)`
   - `applyChooseN()` already calls `advanceScope(...)`
   - stochastic discovery/merge already operates on `decisionKey`
2. `packages/engine/src/kernel/effect-dispatch.ts` already threads `decisionScope` through `applyEffectsWithBudget()` and already defaults top-level calls to `emptyScope()`.
3. `packages/engine/src/kernel/effect-context.ts` already treats `decisionScope` as part of the runtime context contract and its factory helpers already default to `emptyScope()`.
4. `packages/engine/src/kernel/effects-control.ts` is the only file from the original scope that still deserves scrutiny.
   - `applyForEach()` already uses `withIterationSegment(...)`
   - it still has to rebase iteration path against the parent scope while carrying forward updated counters across sibling iterations
   - that is not a reason for a rewrite by itself; only simplify it if a cleaner expression preserves the same semantics
5. The original test plan paths are stale.
   - actual choice tests live in `packages/engine/test/unit/effects-choice.test.ts`
   - actual control-flow tests live in `packages/engine/test/unit/effects-control-flow.test.ts`
   - there is no dedicated `packages/engine/test/unit/kernel/effect-dispatch.test.ts`

## Architecture Check

### What is already better than the prior architecture

1. `DecisionScope` is already the right long-term direction for the effect pipeline.
2. `advanceScope()` gives one authoritative source for decision-key progression instead of scattered string composition and mutable occurrence state.
3. Top-level `emptyScope()` seeding already fixes the class of cross-call leakage bugs that spec 60 called out.
4. `decisionKey` on pending requests is materially cleaner than the old field explosion.

### What is still worth doing

1. Strengthen tests around sequential scope advancement and iteration-scoped decision keys.
2. Keep test helpers aligned with the codec instead of rebuilding iteration-path logic ad hoc where possible.
3. Avoid speculative runtime rewrites. If the current `applyForEach()` shape is the minimal correct way to preserve sibling counters while rebasing iteration path, keep it.

### Ideal-architecture note

If more runtime sites ever need to carry forward counters while rebasing to a parent iteration path, that likely means `decision-scope.ts` should expose an explicit helper for that operation rather than having call sites reconstruct `{ iterationPath, counters }` manually. This ticket should not invent that helper unless the current code proves hard to reason about or error-prone.

## What to Change

### 1. Correct the stale ticket assumptions and scope

- update this ticket so it describes the code that actually exists
- remove claims that `effects-choice.ts` and `effect-dispatch.ts` still need their primary `DecisionScope` migration
- replace stale test paths with real ones

### 2. Reassess `applyForEach()` with an architecture-first bar

- confirm whether the current scope rebasing logic is the minimal robust form
- only change runtime code if it becomes cleaner without widening the surface area
- do not rewrite unrelated control-flow machinery

### 3. Strengthen regression coverage where the current suite is weak

- add/adjust tests that prove sequential effects advance scope occurrences (`#2` for same base key)
- add/adjust tests that prove separate top-level calls still start from a fresh scope
- add/adjust tests that prove `forEach` and nested `forEach` produce the expected iteration-scoped keys in real effect execution
- keep coverage in the existing public-surface test files instead of creating artificial internal-only test files unless necessary

### 4. Keep helpers aligned with the canonical codec

- if test helpers reconstruct iteration scopes manually, prefer using `decision-scope.ts` helpers instead of duplicating the logic
- helper cleanup is in scope because stale helper logic can drift from runtime semantics and create false confidence

## Files to Touch

- `tickets/DECINSARC-003.md` (modify — correct assumptions, scope, and test plan)
- `packages/engine/test/helpers/effect-context-test-helpers.ts` (modify only if helper cleanup improves alignment with codec)
- `packages/engine/test/unit/effects-choice.test.ts` (modify — add scope-threading regressions)
- `packages/engine/test/unit/effects-control-flow.test.ts` (modify — add iteration-scoped decision-key regressions)
- `packages/engine/src/kernel/effects-control.ts` (modify only if the reassessment finds a real cleanup worth making)

## Out of Scope

- Re-migrating `effects-choice.ts` or `effect-dispatch.ts` just to match an outdated ticket
- Modifying `move-decision-sequence.ts` or `legal-choices.ts` in this ticket
- Deleting `decision-occurrence.ts` or `decision-id.ts` here
- Runner changes
- Game-specific behavior

## Acceptance Criteria

### Tests That Must Pass

1. A single `chooseOne` discovery request still exposes the expected canonical `decisionKey`.
2. A repeated decision in one `applyEffects(...)` sequence advances to occurrence `#2` for the second lookup.
3. Separate top-level `applyEffect(...)` calls start from a fresh scope and do not inherit prior occurrences.
4. `rollRandom` discovery still preserves branch-isolated decision identity and merges compatible alternatives by `decisionKey`.
5. `forEach`-scoped decisions resolve against `[N]` keys during real execution.
6. Nested `forEach`-scoped decisions resolve against `[N][M]` keys during real execution.
7. Engine build passes.
8. Engine tests pass.
9. Workspace tests, typecheck, and lint pass.

### Invariants

1. Do not reintroduce `DecisionOccurrenceContext` into the effect runtime.
2. Do not add alias/fallback compatibility logic to the new decision-key path.
3. Do not widen the runtime abstraction surface unless the simplification is demonstrably cleaner than the current shape.
4. Keep all changes game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-choice.test.ts`
   - add a regression for sequential scope threading across `applyEffects(...)`
   - add a regression that separate top-level calls start with fresh scope
2. `packages/engine/test/unit/effects-control-flow.test.ts`
   - add execution coverage proving `forEach` and nested `forEach` consume iteration-scoped decision keys
3. `packages/engine/test/helpers/effect-context-test-helpers.ts`
   - only adjust if needed so helper-created scopes use canonical codec helpers rather than duplicating logic

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-choice.test.js`
3. `node --test packages/engine/dist/test/unit/effects-control-flow.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test`
6. `pnpm turbo typecheck`
7. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-13
- Actual changes:
  - corrected the ticket’s stale assumptions: the main `DecisionScope` migration in `effects-choice.ts`, `effect-dispatch.ts`, and `effect-context.ts` had already been completed before this ticket work started
  - narrowed the implementation scope to the remaining valuable work: codec-aligned helper cleanup and missing regression coverage
  - added `rebaseIterationPath(...)` to `packages/engine/src/kernel/decision-scope.ts` so counter-preserving iteration-path rebasing lives in the codec layer rather than being reconstructed inline by effect execution
  - updated `packages/engine/src/kernel/effects-control.ts` to use the new codec helper from `applyForEach()`
  - updated `packages/engine/test/helpers/effect-context-test-helpers.ts` to build iteration scopes through `withIterationSegment(...)` instead of reconstructing iteration-path strings by hand
  - added regression coverage in `packages/engine/test/unit/effects-choice.test.ts` for sequential occurrence advancement and fresh top-level scope resets
  - added regression coverage in `packages/engine/test/unit/effects-control-flow.test.ts` for `forEach` and nested `forEach` iteration-scoped decision keys during execution
  - added codec coverage in `packages/engine/test/unit/kernel/decision-scope.test.ts` for counter-preserving iteration-path rebasing
- What changed versus the original ticket:
  - no broad runtime rewrite was performed because it was no longer architecturally justified
  - no `effect-dispatch`-specific test file was added because the relevant behavior is better covered through the public `applyEffect` / `applyEffects` surface in the existing test files
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/effects-choice.test.js`
  - `node --test packages/engine/dist/test/unit/effects-control-flow.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
