# TFELIG-001: Type And Validate Event Eligibility Override Windows

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL cross-validation, turn-flow contracts, production FITL turn-flow data
**Deps**: tickets/README.md, tickets/_TEMPLATE.md, archive/specs/17-fitl-turn-sequence-eligibility-and-card-flow.md, data/games/fire-in-the-lake/30-rules-actions.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/cnl/cross-validate.ts

## Problem

`turnFlow.eligibility.overrideWindows` is currently a flat namespace shared by event eligibility overrides and other turn-scoped window concepts such as special-activity windows. After Son Tay introduced immediate `turn`-duration event overrides, the engine now accepts any `turn` window id referenced by `eligibilityOverrides` as long as it exists. That is too permissive: a future GameSpecDoc can accidentally point an event eligibility override at a non-eligibility window like `us-special-window` and silently mutate current-card eligibility.

This is an architecture issue, not a Fire in the Lake rules issue. The data model is currently underspecified, and validation is too weak for a now-broader generic capability.

## Assumption Reassessment (2026-03-10)

1. Current production FITL data defines `remain-eligible`, `make-ineligible`, `make-eligible-now`, and special-activity windows such as `us-special-window` in the same `turnFlow.eligibility.overrideWindows` array.
2. Current cross-validation in `packages/engine/src/cnl/cross-validate.ts` only verifies that an event `eligibilityOverride.windowId` exists; it does not verify that the referenced window is intended for event eligibility semantics.
3. The new Son Tay implementation did not add game-specific engine branching; the mismatch is structural. The corrected scope is to tighten the generic contract so only explicitly eligibility-safe windows can be used by event eligibility overrides.

## Architecture Check

1. Typing or partitioning eligibility override windows is cleaner than relying on naming conventions because it moves intent into the schema and validator instead of leaving correctness to human discipline.
2. This preserves the `GameSpecDoc` vs `GameDef` boundary: game-specific cards still declare which window they want, but the engine-side contract remains generic and validates the allowed window class without any Fire in the Lake branching.
3. No backwards-compatibility aliases or shims should be introduced. Update the contract and migrate current FITL data to the stricter shape directly.

## What to Change

### 1. Tighten the window contract

Refactor the turn-flow eligibility window definition so event eligibility overrides can only target explicitly eligibility-scoped windows.

Acceptable implementation shapes:
- add a typed discriminator such as `usage: eligibilityOverride | operationProfileLink`,
- or split the registry into separate arrays if that is cleaner.

The chosen shape must make it impossible for a GameSpecDoc event to reference an unrelated turn window and pass validation.

### 2. Strengthen validation and compilation

Update cross-validation and any related schema/compile paths so:
- event `eligibilityOverrides` reject non-eligibility windows,
- diagnostics point to the exact `windowId` field,
- existing operation-profile linked windows still validate against their own allowed window set.

### 3. Migrate production FITL data

Update `data/games/fire-in-the-lake/30-rules-actions.md` and any affected event cards to the stricter contract.

If the chosen contract renames or repartitions `make-eligible-now`, Son Tay in `data/games/fire-in-the-lake/41-content-event-decks.md` should be updated as part of this ticket. Do not create a one-off Son Tay exception in engine code.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/cnl/compile-turn-flow.ts` (modify if contract shape changes require it)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify if contract shape changes require it)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify if window references need migration)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-son-tay.test.ts` (modify if production window ids change)

## Out of Scope

- Reworking Son Tay rules behavior beyond any mechanical data migration required by the stricter window contract.
- Adding UI-only or visual presentation changes.
- Adding game-specific runtime branches to special-case Fire in the Lake.

## Acceptance Criteria

### Tests That Must Pass

1. Event `eligibilityOverrides` that reference a non-eligibility window fail validation with a precise diagnostic.
2. Production FITL data compiles with the stricter contract and Son Tay still behaves correctly.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Event eligibility overrides may reference only windows explicitly designated for event eligibility semantics.
2. `GameDef` and runtime stay game-agnostic; no card-specific or game-specific branching is added to enforce the new contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — add a rejection case where an event override references a non-eligibility turn window.
2. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — verify the production spec still exposes the intended eligibility override windows after the contract change.
3. `packages/engine/test/integration/fitl-events-son-tay.test.ts` — keep Son Tay passing after any window-id/data migration.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/cross-validate.test.js dist/test/integration/fitl-production-data-compilation.test.js dist/test/integration/fitl-events-son-tay.test.js`
3. `pnpm -F @ludoforge/engine test`
