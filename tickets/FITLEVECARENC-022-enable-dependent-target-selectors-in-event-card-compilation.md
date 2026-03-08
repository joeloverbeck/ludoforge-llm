# FITLEVECARENC-022: Enable Dependent Target Selectors in Event Card Compilation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL event-card target selector lowering contract
**Deps**: archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, specs/29-fitl-event-card-encoding.md

## Problem

Event target selector lowering currently cannot reference bindings declared by earlier targets in the same scope. This blocks canonical multi-target modeling and forces imperative selector effects (`chooseOne`/`chooseN`) inside target-local `effects` where declarative target declarations should be used.

## Assumption Reassessment (2026-03-08)

1. In `packages/engine/src/cnl/compile-event-cards.ts`, `lowerEventTargets()` lowers each selector with `buildConditionLoweringContext(context, bindingScope ?? [])` and excludes prior same-scope target bindings from selector scope. Verified.
2. The same function does include `accumulatedTargetBindings` for lowering `target.effects`, proving the gap is selector-specific rather than global binding support. Verified.
3. This mismatch creates non-canonical pressure in authored event data (for example card-90 relocation flow encoded with inner `chooseOne` effect), so scope must be corrected before further data cleanup. Verified.

## Architecture Check

1. Allowing dependent target selectors is the clean declarative architecture: target selection graph is explicit in `targets[]`, not hidden in imperative side effects.
2. This remains game-agnostic engine behavior: it changes generic compiler binding scope semantics, not FITL-specific logic.
3. No backward-compatibility aliasing/shims: one canonical rule for selector binding visibility within ordered target lists.

## What to Change

### 1. Extend selector lowering scope for ordered targets

In `lowerEventTargets()`, include previously declared same-scope target bindings when lowering each target selector.

### 2. Add targeted compiler tests for dependent selectors

Add positive/negative tests proving:
- target N selector can reference target N-1 binding
- forward/self-invalid binding references still produce canonical diagnostics

### 3. Keep deterministic binding-order semantics explicit

Document/enforce that same-scope target declarations are processed in source order for selector binding visibility.

## Files to Touch

- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify if diagnostics coverage needs update)

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

1. `packages/engine/test/unit/compile-top-level.test.ts` — add event-card fixtures proving dependent selector binding visibility and invalid reference rejection.
2. `packages/engine/test/unit/cross-validate.test.ts` — ensure cross-validation expectations remain aligned after selector-scope correction (if affected).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
