# ENG-220: Align Event Target Selector Validation with Canonical Choice Contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — event validation parity, choice-query runtime-shape enforcement
**Deps**: packages/engine/src/kernel/event-execution.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/choice-options-runtime-shape-contract.ts

## Problem

Event target selectors are executed by synthesizing `chooseOne`/`chooseN` effects at runtime, but validator coverage currently only runs `validateOptionsQuery` on `EventTargetDef.selector`. That misses the canonical choice runtime-shape contract enforced for ordinary `chooseOne`/`chooseN` effects and leaves event targets with weaker validation than the effect system they compile into.

## Assumption Reassessment (2026-03-09)

1. Event target execution is currently lowered to synthesized `chooseOne`/`chooseN` effects before applying event effects.
2. Canonical `chooseOne`/`chooseN` validation already rejects selectors whose runtime shapes cannot be encoded as move parameters.
3. Mismatch: event target selectors do not yet receive the same runtime-shape validation despite using the same underlying selection mechanics. Correction: validate event target selectors against the same canonical choice contract.

## Architecture Check

1. Reusing the existing choice contract is cleaner than inventing an event-only selector rule; event targets are conceptually declarative sugar over standard choice effects.
2. This preserves the `GameSpecDoc` boundary by keeping game-specific target definitions in data while `GameDef` validation enforces generic move-param and selection invariants.
3. No backwards-compatibility layer is warranted; event targets should obey the same canonical selection contract as every other choice surface.

## What to Change

### 1. Reuse canonical choice runtime-shape validation for event targets

Update event target validation so `selector` is checked not only structurally but also for move-param encodable runtime shapes, matching synthesized `chooseOne`/`chooseN`.

### 2. Cover single and multi-select event targets

Add regression tests showing invalid selector shapes are rejected for both single-target and multi-target event definitions.

### 3. Prefer shared helper wiring over duplicated logic

If the current choice runtime-shape check can be reused directly, route event target validation through that helper rather than duplicating diagnostics or rules.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Changing event target runtime lowering
- New event target features or card data rewrites
- UI or `visual-config.yaml` work

## Acceptance Criteria

### Tests That Must Pass

1. Event target selectors with non-move-param-encodable runtime shapes fail validation with the canonical choice runtime-shape diagnostic.
2. Event target selectors that satisfy canonical `chooseOne`/`chooseN` contracts continue to validate successfully.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. Event targeting and normal choice effects share one canonical selection contract.
2. Validation stays game-agnostic and contains no event-card-id or game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — invalid single-select event target selector runtime shape.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — invalid multi-select event target selector runtime shape.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — valid event target selector parity with canonical choice effects.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test`

