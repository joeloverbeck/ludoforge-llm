# GAMESPECAUTH-002: Make local control-flow limits resolve bindings from the current authored scope

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Narrowed — regression coverage for already-correct scoped binding resolution, ticket assumption cleanup
**Deps**: tickets/README.md, tickets/_TEMPLATE.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

This ticket originally assumed an active runtime scoping bug in local control-flow limit resolution. Reassessment against the current codebase shows the architecture already resolves `forEach.limit` and `chooseN.min/max` against the current merged runtime binding scope. The remaining issue is ticket drift: the ticket points at outdated root-cause assumptions, stale file targets, and incomplete regression coverage for the authored pattern used by Russian Arms.

## Assumption Reassessment (2026-03-10)

1. Current runtime code in `packages/engine/src/kernel/effects-control.ts` already evaluates `forEach.limit` and `reduce.limit` with `resolveEffectBindings(ctx)`, which merges move params with the current nested binding scope before calling `resolveControlFlowIterationLimit`.
2. Current runtime code in `packages/engine/src/kernel/effects-choice.ts` already evaluates `chooseN.min/max` with the same merged binding model via `resolveChooseNCardinality`.
3. The authored Russian Arms data in `data/games/fire-in-the-lake/41-content-event-decks.md` still uses the exact `let` -> `forEach.limit` pattern this ticket was concerned about, and the focused integration suite `packages/engine/test/integration/fitl-events-russian-arms.test.ts` now passes.
4. The ticket's original root-cause narrative is therefore stale for the current branch. The real gap is direct, focused regression coverage for this invariant, not missing engine capability.
5. The original file list is partially outdated: there is no current `packages/engine/src/kernel/resolve-ref*` or `packages/engine/src/kernel/*control*` change required for this ticket's corrected scope.

## Architecture Check

1. The current architecture is already the cleaner design: one merged runtime binding model feeds control-flow and choice cardinality evaluation instead of ad hoc special cases.
2. A broader refactor is not justified here because it would duplicate behavior already centralized in `resolveControlFlowIterationLimit` and `resolveChooseNCardinality`.
3. The durable fix is to pin this invariant with direct tests so future refactors cannot silently regress it.
4. This remains entirely game-agnostic: the regression surface is generic effect/choice scoping semantics, not FITL-specific logic.

## What to Change

### 1. Correct the ticket assumptions and scope

Replace the stale bug narrative with the current architectural reality: the engine already supports the intended scoped binding behavior.

### 2. Add direct regression coverage

Add focused tests that prove locally bound values remain visible when `forEach.limit` and related cardinality expressions are resolved inside authored nested scopes.

### 3. Avoid unnecessary engine churn

Do not rewrite runtime binding resolution unless a failing test demonstrates a real discrepancy. The current architecture is already preferable to introducing new aliasing or fallback paths.

## Files to Touch

- `tickets/GAMESPECAUTH-002-control-flow-limit-binding-scope.md` (modify)
- `packages/engine/test/unit/effects-control-flow.test.ts` (modify)
- `packages/engine/test/unit/effects-choice.test.ts` (modify if needed)
- `packages/engine/test/integration/fitl-events-russian-arms.test.ts` (no code change expected; keep as verification target)

## Out of Scope

- New FITL-specific macros
- Reworking runtime binding architecture without a demonstrated failing case
- Changing unrelated binding-shadowing diagnostics
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. A local `let` binding can be referenced by `forEach.limit` within the same authored scope.
2. Direct regression tests prove this invariant without relying only on the Russian Arms integration path.
3. Existing Russian Arms integration coverage stays green.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Binding resolution remains generic and game-agnostic.
2. Authored nested control flow continues to follow one coherent scope model across runtime control-flow and choice cardinality evaluation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-control-flow.test.ts` — add direct coverage for local `let` binding usage in `forEach.limit`.
2. `packages/engine/test/unit/effects-choice.test.ts` — add or confirm direct coverage that expression-valued `chooseN.min/max` resolve against current bindings when nested inside authored scope.
3. `packages/engine/test/integration/fitl-events-russian-arms.test.ts` — verification target only; no authored-data rewrite is required if the invariant already holds.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-control-flow.test.js`
3. `node --test packages/engine/dist/test/unit/effects-choice.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-russian-arms.test.js`
5. `pnpm turbo test`
6. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-10
- What actually changed:
  - Reassessed the ticket against the current engine and corrected its assumptions/scope.
  - Added direct regression coverage in `packages/engine/test/unit/effects-control-flow.test.ts` proving `let`-scoped bindings resolve inside `forEach.limit`.
  - Added direct regression coverage in `packages/engine/test/unit/effects-choice.test.ts` proving `let`-scoped bindings resolve inside `chooseN.min/max`.
- Deviations from original plan:
  - No engine runtime code changes were needed. The current architecture already resolved control-flow and choice cardinality expressions against the active merged binding scope.
  - No FITL authored-data rewrite was needed because `packages/engine/test/integration/fitl-events-russian-arms.test.ts` already passes with the current authored shape.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/effects-control-flow.test.js`
  - `node --test packages/engine/dist/test/unit/effects-choice.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-russian-arms.test.js`
  - `pnpm turbo test`
  - `pnpm turbo lint`
