# SEATRES-059: Harden scenario selection adapter contract to eliminate input mismatch

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL scenario selection policy contract hardening
**Deps**: archive/tickets/SEATRES/SEATRES-044-split-scenario-linked-selection-core-from-diagnostic-adapters.md

## Problem

The new scenario selection diagnostic adapters currently accept `selection` and the requested id as separate arguments. This allows future call sites to accidentally pass a mismatched id, producing incorrect missing-reference diagnostics while still typechecking.

## Assumption Reassessment (2026-03-03)

1. `emitScenarioSelectionDiagnostics(...)` and `emitScenarioLinkedAssetSelectionDiagnostics(...)` currently take requested ids separately from selection results. Verified in `packages/engine/src/cnl/scenario-linked-asset-selection-policy.ts`.
2. Current compiler/validator call sites pass coherent inputs and behavior is correct today. Verified in `compile-data-assets.ts` and `validate-extensions.ts`.
3. `tickets/SEATRES-060-enforce-physical-module-boundary-between-scenario-selection-core-and-diagnostics.md` is active and depends on this ticket, but it scopes module-boundary extraction rather than adapter-input cohesion. Scope remains non-duplicative.

## Architecture Check

1. Encoding requested-id context inside the selection result (or a single adapter context object) is cleaner and more robust than multi-argument coupling.
2. This remains game-agnostic CNL policy infrastructure and does not introduce game-specific logic into `GameDef` or runtime/simulator.
3. No backwards-compatibility aliasing/shims: remove the old adapter signatures and migrate call sites directly.

## What to Change

### 1. Make adapter inputs single-source and cohesive

1. Refactor adapter signatures so they cannot be called with a selection/id mismatch.
2. Ensure missing-reference adapter behavior always uses the same requested id that produced the selection result.

### 2. Migrate call sites and remove mismatch-prone API

1. Update compiler and validator call sites to the hardened API shape.
2. Remove legacy mismatch-prone adapter signatures entirely.

## Files to Touch

- `packages/engine/src/cnl/scenario-linked-asset-selection-policy.ts` (modify)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/test/unit/data-asset-selection-policy.test.ts` (modify/add)

## Out of Scope

- Scenario failure-reason mapping policy changes (tracked in `SEATRES-047`)
- Alternatives dedupe behavior changes (tracked in `SEATRES-055`)
- Any runtime/kernel simulation behavior change

## Acceptance Criteria

### Tests That Must Pass

1. Adapter API no longer accepts a separately passed requested id; missing-reference emission derives requested-id context directly from the selection result object.
2. Missing-reference diagnostics continue to include the correct requested id and alternatives.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Selection-to-diagnostic mapping is deterministic and derives from one coherent selection context.
2. Compiler/validator policy stays game-agnostic and independent of visual configuration files.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/data-asset-selection-policy.test.ts` — add adapter cohesion assertions (requested id and alternatives stay tied to selection result). Rationale: prevents future signature regression.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — verify scenario selector missing diagnostics still report correct requested id path/message after API hardening. Rationale: protects externally observable compiler behavior.
3. `packages/engine/test/unit/validate-spec-scenario.test.ts` — verify validator selector-missing diagnostics remain correct after migration. Rationale: cross-surface parity guard.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/data-asset-selection-policy.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-03
- **What changed**:
  - Hardened `ScenarioSelectionResult` so it now carries `requestedId`.
  - Updated scenario and linked-asset diagnostic emitters to derive missing-reference ids from `selection.requestedId` instead of accepting a separate id parameter.
  - Migrated compiler and validator call sites to the hardened emitter signatures.
  - Added/updated unit assertions to lock requested-id cohesion and verify user-visible diagnostics still include the missing selector id.
- **Deviations from original plan**:
  - No scope deviation on implementation.
  - Assumption notes were clarified to acknowledge `SEATRES-060` as a dependent, non-duplicative active ticket.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/data-asset-selection-policy.test.js` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (360/360).
  - `pnpm turbo typecheck && pnpm turbo lint` passed.
