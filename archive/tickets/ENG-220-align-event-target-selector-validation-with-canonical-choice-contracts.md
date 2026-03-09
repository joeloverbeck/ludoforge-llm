# ENG-220: Align Event Target Selector Validation with Canonical Choice Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — event-target validation parity via shared choice-query contract enforcement
**Deps**: packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/test/unit/validate-gamedef.test.ts

## Problem

Event target selectors are executed by synthesizing `chooseOne`/`chooseN` effects at runtime, but validator coverage currently only runs `validateOptionsQuery` on `EventTargetDef.selector`. That misses the canonical choice runtime-shape contract enforced for ordinary `chooseOne`/`chooseN` effects and leaves event targets with weaker validation than the effect system they compile into.

## Assumption Reassessment (2026-03-09)

1. Confirmed: event target execution is lowered in `packages/engine/src/kernel/event-execution.ts` to synthesized `chooseOne`/`chooseN` effects before target effects are applied.
2. Confirmed: canonical `chooseOne`/`chooseN` validation in `packages/engine/src/kernel/validate-gamedef-behavior.ts` already rejects selectors whose runtime shapes cannot be encoded as move parameters.
3. Confirmed discrepancy: `validateEventTargets` currently validates selector structure only; it does not apply the canonical runtime-shape contract used by `chooseOne`/`chooseN`.
4. Scope correction: the runtime lowering code and the shared runtime-shape contract helper already match the desired architecture. The missing work is validator wiring parity plus regression coverage, not a runtime redesign.

## Architecture Check

1. Reusing the existing choice contract is cleaner than inventing an event-only selector rule; event targets are declarative sugar over standard choice effects.
2. This preserves the `GameSpecDoc` boundary by keeping game-specific target definitions in data while `GameDef` validation enforces generic move-param and selection invariants.
3. The cleanest implementation is a single shared validator path for "choice options query contract" that can be applied from `chooseOne`, `chooseN`, and event targets without duplicating the query-validation/error-suppression pattern.
4. No backwards-compatibility layer is warranted; event targets should obey the same canonical selection contract as every other choice surface.

## What to Change

### 1. Reuse canonical choice runtime-shape validation for event targets

Update event target validation so `selector` is checked not only structurally but also for move-param encodable runtime shapes, matching synthesized `chooseOne`/`chooseN`.

### 2. Cover single and multi-select event targets

Add regression tests showing invalid selector shapes are rejected for both single-target and multi-target event definitions.

### 3. Prefer shared helper wiring over duplicated logic

Route event-target selector validation through the same query-validation + runtime-shape helper pattern used for canonical choice effects. Avoid duplicating diagnostics, suppression rules, or bespoke event-only branches.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Changing event target runtime lowering
- New event target features or card data rewrites
- UI or `visual-config.yaml` work
- Broad validator refactors outside the shared choice-options contract wiring needed for this parity fix

## Acceptance Criteria

### Tests That Must Pass

1. Event target selectors with non-move-param-encodable runtime shapes fail validation with the canonical choice runtime-shape diagnostic.
2. Event target selectors that satisfy canonical `chooseOne`/`chooseN` contracts continue to validate successfully.
3. Event target selectors that already have structural query errors do not emit duplicate secondary runtime-shape diagnostics.
4. Relevant suites pass after the change, including targeted unit validation coverage and the package test/lint gates used for finalization.

### Invariants

1. Event targeting and normal choice effects share one canonical selection contract.
2. Validation stays game-agnostic and contains no event-card-id or game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — invalid single-select event target selector runtime shape.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — invalid multi-select event target selector runtime shape.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — suppression when an event target selector already fails structural query validation.
4. `packages/engine/test/unit/validate-gamedef.test.ts` — valid event target selector parity with canonical choice effects.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-09
- What actually changed: event target selector validation now routes through the same shared choice-options contract used by `chooseOne` and `chooseN`, including runtime-shape enforcement and suppression of duplicate diagnostics when structural query validation already fails.
- Deviations from original plan: none on behavior; scope was narrowed before implementation to avoid unnecessary runtime changes in `event-execution.ts` and to keep the fix in validator wiring plus regression tests.
- Verification results: `pnpm -F @ludoforge/engine build`, `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`, `pnpm -F @ludoforge/engine test`, and `pnpm -F @ludoforge/engine lint` all passed on 2026-03-09.
