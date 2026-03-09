# FITLEVECARENC-022: Enable Dependent Target Selectors in Event Card Compilation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL event-card target selector lowering contract
**Deps**: archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, specs/29-fitl-event-card-encoding.md

## Problem

Event target selector lowering currently cannot reference bindings declared by earlier targets in the same scope. This blocks canonical multi-target modeling and forces imperative selector effects (`chooseOne`/`chooseN`) inside target-local `effects` where declarative target declarations should be used.

## Assumption Reassessment (2026-03-08)

1. In `packages/engine/src/cnl/compile-event-cards.ts`, `lowerEventTargets()` lowers each selector with `buildConditionLoweringContext(context, bindingScope ?? [])` and excludes prior same-scope target bindings from selector scope. Verified.
2. `lowerQueryNode()` treats `query: "binding"` as pass-through without binding-scope validation. Verified in `packages/engine/src/cnl/compile-conditions.ts`.
3. The same `lowerEventTargets()` function already includes `accumulatedTargetBindings` for lowering `target.effects`, proving scope composition and selector validation are currently inconsistent for selectors. Verified.
4. Running full engine tests with global binding-query validation causes broad unrelated breakage, so this ticket should enforce validation only in event-card target-selector lowering scope. Verified.
5. Authored FITL event data still contains imperative selector patterns (for example `card-90` in `data/games/fire-in-the-lake/41-content-event-decks.md`) that this compiler gap encourages. Verified.
6. Existing unit coverage does not currently assert same-scope target selector binding visibility or forward/self rejection in event-card selector compilation. Verified.
7. `packages/engine/test/unit/cross-validate.test.ts` is not on the critical path for this bug; the behavior is owned by CNL lowering unit coverage, not cross-reference validation. Verified.

## Architecture Check

1. Allowing dependent target selectors is the clean declarative architecture: target selection graph is explicit in `targets[]`, not hidden in imperative side effects.
2. This remains game-agnostic engine behavior: it changes generic compiler binding scope semantics, not FITL-specific logic.
3. No backward-compatibility aliasing/shims: one canonical rule for event-card target-selector binding visibility and validation within ordered target lists.
4. Architectural hardening note: selector/effect scope composition currently happens in separate inline code paths in `lowerEventTargets()`, which risks future drift. This ticket keeps the fix minimal; a follow-up refactor can centralize scope construction in one helper.

## What to Change

### 1. Extend selector lowering scope for ordered targets

In `lowerEventTargets()`, include previously declared same-scope target bindings when lowering each target selector.

### 2. Enforce target-selector binding-query scope validation

In `lowerEventTargets()`, reject selector `query: "binding"` references that are not in-scope at that declaration point (including forward/self references).

### 3. Add targeted compiler tests for dependent selectors

Add positive/negative tests proving:
- target N selector can reference target N-1 binding
- forward/self-invalid binding references still produce canonical diagnostics

### 4. Keep deterministic binding-order semantics explicit

Document/enforce that same-scope target declarations are processed in source order for selector binding visibility.

## Files to Touch

- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)

## Out of Scope

- FITL card data migration itself (covered by separate ticket)
- Runtime effect execution ordering changes
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. A same-scope target selector referencing an earlier target binding compiles without unbound-binding diagnostics.
2. Invalid forward/self target-binding selector references fail with canonical compiler diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Ordered target declarations form a deterministic binding scope chain.
2. Compiler behavior remains fully game-agnostic and declarative.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — add event-card fixtures proving dependent selector binding visibility and forward/self rejection.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completion date: 2026-03-08
- What actually changed:
  - Updated `lowerEventTargets()` to include previously declared same-scope target bindings when lowering each selector.
  - Added explicit target-selector `query: "binding"` scope diagnostics in `compile-event-cards.ts`, so forward/self references are rejected while backward references are accepted.
  - Added unit tests in `compile-top-level.test.ts` for dependent selector success and forward/self rejection.
- Deviations from original plan:
  - Did not change `cross-validate.test.ts` because the bug is in CNL lowering, not cross-reference validation.
  - Evaluated global `query: "binding"` validation in `compile-conditions.ts`, but deferred it due broad unrelated integration breakage; enforced validation only in event-card target-selector lowering scope.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
