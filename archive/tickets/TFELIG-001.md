# TFELIG-001: Type And Validate Turn-Flow Window Usage

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — GameSpecDoc/GameDef turn-flow schema, CNL validation/cross-validation, linked-window contracts, production FITL turn-flow data
**Deps**: tickets/README.md, tickets/_TEMPLATE.md, archive/specs/17-fitl-turn-sequence-eligibility-and-card-flow.md, data/games/fire-in-the-lake/30-rules-actions.md, packages/engine/src/contracts/turn-flow-linked-window-contract.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/cnl/cross-validate.ts

## Problem

`turnFlow.eligibility.overrideWindows` is currently a flat namespace shared by two different consumers:

- event `eligibilityOverrides`, which need windows that are safe to mutate turn-flow eligibility, and
- action-pipeline `linkedWindows`, which model operation/special-activity availability windows.

The current validators only check id existence. That means a future `GameSpecDoc` can point an event `eligibilityOverride.windowId` at a non-eligibility window like `us-special-window` and still compile. The model is structurally underspecified.

This is an architecture issue, not a Fire in the Lake rules issue. The data model is currently underspecified, and validation is too weak for a now-broader generic capability.

## Assumption Reassessment (2026-03-10)

1. Current production FITL data defines `remain-eligible`, `make-ineligible`, `make-eligible-now`, and special-activity windows such as `us-special-window` in the same `turnFlow.eligibility.overrideWindows` array.
2. Current cross-validation in `packages/engine/src/cnl/cross-validate.ts` only verifies that an event `eligibilityOverride.windowId` exists; it does not verify that the referenced window is intended for event eligibility semantics.
3. Kernel `validateGameDef` also treats the same registry as the source of truth for `actionPipeline.linkedWindows`, via the shared `turn-flow-linked-window-contract`. Any contract change must preserve typed validation for both consumers.
4. Existing coverage already includes:
   - `packages/engine/test/integration/fitl-eligibility-window.test.ts` for generic override runtime behavior,
   - `packages/engine/test/unit/contracts/turn-flow-linked-window-contract.test.ts` for linked-window contract helpers,
   - `packages/engine/test/unit/validate-gamedef.test.ts` for kernel-side `linkedWindows` validation.
5. The Son Tay implementation did not add game-specific engine branching; Son Tay is only one production caller that exposed the structural weakness. The scope should remain generic.

## Architecture Check

1. The current architecture is weaker than it should be because a single untyped registry serves two distinct semantic roles.
2. The cleanest in-scope fix is to keep one registry of turn-flow windows but add explicit usage typing on each window definition so validators can enforce consumer-specific rules without duplicating ids or relying on naming conventions.
3. A full rename from `eligibility.overrideWindows` to a broader `turnFlow.windows` registry may be an even cleaner end state, but it would widen the refactor materially. For this ticket, add explicit typing to the existing structure and remove the semantic ambiguity first.
4. No backwards-compatibility aliases or shims should be introduced. Update the contract and migrate current FITL data to the stricter shape directly.

## What to Change

### 1. Tighten the turn-flow window contract

Refactor the turn-flow window definition so each declared window advertises its allowed consumer usage, and event eligibility overrides can only target windows that include eligibility-override usage.

Preferred implementation shape:
- add an explicit field on each window definition, such as `usages` or `usage`, covering at least:
  - event eligibility overrides
  - action-pipeline linked windows

The chosen shape must make it impossible for a `GameSpecDoc` event to reference an action-pipeline-only window and pass validation.

### 2. Strengthen validation and compilation

Update cross-validation and any related schema/compile paths so:
- event `eligibilityOverrides` reject windows whose declared usage does not include event eligibility overrides,
- diagnostics point to the exact `windowId` field,
- existing operation-profile linked windows still validate against their own allowed window usage set,
- kernel `validateGameDef` and CNL continue to share the same linked-window contract semantics.

### 3. Migrate production FITL data

Update `data/games/fire-in-the-lake/30-rules-actions.md` and any affected event cards to the stricter contract.

Production FITL must explicitly mark:
- `make-eligible-now`, `remain-eligible`, and `make-ineligible` as eligibility-override-capable windows,
- faction special-activity windows as action-pipeline-linked windows only.

If the chosen contract requires migrating `make-eligible-now`, Son Tay in `data/games/fire-in-the-lake/41-content-event-decks.md` should be updated as part of this ticket. Do not create a one-off Son Tay exception in engine code.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/validate-spec-shared.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/cnl/compile-turn-flow.ts` (modify if contract shape changes require it)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify if contract shape changes require it)
- `packages/engine/src/contracts/turn-flow-linked-window-contract.ts` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify if window references need migration)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)
- `packages/engine/test/unit/contracts/turn-flow-linked-window-contract.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify)
- `packages/engine/test/integration/fitl-eligibility-window.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-son-tay.test.ts` (modify if production window ids change)

## Out of Scope

- Reworking Son Tay rules behavior beyond any mechanical data migration required by the stricter window contract.
- Adding UI-only or visual presentation changes.
- Adding game-specific runtime branches to special-case Fire in the Lake.

## Acceptance Criteria

### Tests That Must Pass

1. Event `eligibilityOverrides` that reference an action-pipeline-only window fail validation with a precise diagnostic.
2. Action pipelines still validate successfully when they reference declared linked-window-capable windows.
3. Production FITL data compiles with the stricter contract and Son Tay still behaves correctly.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Event eligibility overrides may reference only windows explicitly designated for event eligibility semantics.
2. Action pipelines may reference only windows explicitly designated for linked-window semantics.
3. `GameDef` and runtime stay game-agnostic; no card-specific or game-specific branching is added to enforce the new contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — add a rejection case where an event override references a non-eligibility turn window.
2. `packages/engine/test/unit/contracts/turn-flow-linked-window-contract.test.ts` — verify the shared contract filters/collects windows by allowed usage.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — verify kernel validation still accepts pipeline-linked windows and rejects usage mismatches if applicable there.
4. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — verify the production spec still exposes the intended typed windows after the contract change.
5. `packages/engine/test/integration/fitl-eligibility-window.test.ts` — verify generic runtime behavior still works with explicitly eligibility-scoped windows.
6. `packages/engine/test/integration/fitl-events-son-tay.test.ts` — keep Son Tay passing after any window-id/data migration.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/cross-validate.test.js dist/test/unit/contracts/turn-flow-linked-window-contract.test.js dist/test/unit/validate-gamedef.test.js dist/test/integration/fitl-eligibility-window.test.js dist/test/integration/fitl-production-data-compilation.test.js dist/test/integration/fitl-events-son-tay.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Outcome amended: 2026-03-10
- Completion date: 2026-03-10
- What actually changed:
  - Added explicit `usages` typing to the shared turn-flow window registry and finalized that registry at `turnFlow.windows`, so each window declares whether it is valid for `eligibilityOverride`, `actionPipeline`, or both.
  - Narrowed `turnFlow.eligibility` to seat-ordering concerns only (`seats`), removing the prior semantic leak where non-eligibility windows lived under `eligibility`.
  - Updated shared contracts, CNL schema/validation, kernel schema/types, runtime lookup, and linked-window validation to enforce consumer-specific window usage from `turnFlow.windows` instead of a flat id-only namespace.
  - Migrated FITL production turn-flow data so eligibility windows are marked for event overrides and faction special-activity windows are marked for action-pipeline linkage only.
  - Strengthened tests across cross-validation, kernel linked-window validation, contract helpers, FITL turn-flow fixtures, and runtime integration coverage.
- Deviations from original plan:
  - The first completion pass kept the registry under `turnFlow.eligibility.overrideWindows`, but the implementation was refined the same day to the cleaner end-state `turnFlow.windows`. This amendment records the shipped architecture.
  - No Son Tay data migration was needed beyond validating against the stricter typed window catalog because the existing event window ids remained correct.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test dist/test/unit/cross-validate.test.js dist/test/unit/contracts/turn-flow-linked-window-contract.test.js dist/test/unit/validate-gamedef.test.js dist/test/integration/fitl-eligibility-window.test.js dist/test/integration/fitl-production-data-compilation.test.js dist/test/integration/fitl-events-son-tay.test.js` passed.
  - `pnpm -F @ludoforge/engine run schema:artifacts` completed and refreshed schema artifacts.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
