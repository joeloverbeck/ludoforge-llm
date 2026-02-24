# FITLSEC4RULGAP-001: Transport Ranger Movement (Non-Shaded Branch)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data + integration tests
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)
**Refs**: `reports/fire-in-the-lake-rules-section-4.md`

## Problem

Rule 4.3.2: "Select 1 space and move up to 6 ARVN Troops and/or Rangers from there onto 1 or more adjacent LoCs..."

In `transport-profile` -> `move-selected-pieces`, the non-shaded branch filters ARVN pieces with `{ prop: type, eq: troops }`, excluding Rangers (`type: guerrilla`). This violates 4.3.2 for non-shaded/inactive Transport movement.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` non-shaded Transport still uses `{ prop: type, eq: troops }` in both `select-origin` and `move-selected-pieces` paths.
2. The shaded branch already uses `{ prop: type, op: in, value: [troops, guerrilla] }`, so DSL support for mixed-type selection already exists.
3. Existing integration tests already cover this behavior and currently encode the old invariant (troop-only when inactive/unshaded):
   - `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts`
   - `packages/engine/test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts`
4. Because behavioral coverage exists, a new structural/AST assertion is unnecessary and would be more brittle than behavior-level assertions.

## Architecture Check

1. This remains a data-only fix in GameSpecDoc YAML (engine-agnostic).
2. Updating existing behavioral integration tests is architecturally preferable to adding structure-coupled tests that depend on YAML shape.
3. Capability semantics stay clean:
   - `cap_armoredCavalry` shaded still matters for Ranger flipping (and related stages),
   - Ranger movement eligibility no longer diverges from base Rule 4.3.2.
4. No compatibility shims or aliasing; tests should enforce canonical rule behavior directly.

## What to Change

### 1. Fix non-shaded Transport piece filtering

In `data/games/fire-in-the-lake/30-rules-actions.md`, update non-shaded Transport filters from troop-only to Troops+Rangers:

- `select-origin` non-shaded branch: `{ prop: type, eq: troops }` -> `{ prop: type, op: in, value: [troops, guerrilla] }`
- `move-selected-pieces` non-shaded branch: `{ prop: type, eq: troops }` -> `{ prop: type, op: in, value: [troops, guerrilla] }`

### 2. Update existing integration tests to the corrected invariant

Adjust existing tests that currently expect troop-only non-shaded movement so they instead assert Ranger inclusion for inactive/unshaded Transport movement.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — Transport non-shaded filters)
- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify — baseline Transport expectations)
- `packages/engine/test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts` (modify — marker-state Transport expectations/messages)

## Out of Scope

- Transport `flip-rangers-underground` stage semantics (ticket FITLSEC4RULGAP-002)
- Any kernel/compiler source code
- Any non-Transport special activity profiles

## Acceptance Criteria

### Tests That Must Pass

1. Inactive/unshaded Transport can move ARVN Rangers from origin with Troops (up to the same combined limit).
2. Shaded Transport still moves Rangers and keeps its existing shaded-specific behavior.
3. `pnpm turbo build`
4. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. The 6-piece limit remains intact.
3. No game-specific logic is added to shared engine code.
4. Texas Hold'em compilation tests still pass via the normal engine suite.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts`
   - Modify baseline Transport test to assert inactive Transport moves Rangers as eligible pieces.
2. `packages/engine/test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts`
   - Modify capability test expectations to assert Ranger movement in inactive/unshaded/shaded, with shaded-only behavior assertions retained where applicable.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test -- fitl-capabilities-transport-govern-ambush-terror.test.ts`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-02-24
- Actual changes:
  - Updated non-shaded `transport-profile` filters in `select-origin` and `move-selected-pieces` to include both `troops` and `guerrilla`.
  - Updated existing integration tests to enforce Ranger movement in inactive/unshaded Transport while preserving shaded flip behavior checks.
  - Follow-up architecture cleanup: removed duplicated `cap_armoredCavalry` branch logic in Transport movement/origin selection and centralized ARVN Transport-eligible piece types in `metadata.namedSets.ARVNTransportEligibleTypes`.
- Deviations from original plan:
  - Replaced the proposed new structural assertion with updates to existing behavior-level integration tests, because those are less brittle and already cover this area.
  - Corrected ticket assumptions to reflect existing tests that encoded the outdated troop-only behavior.
- Verification results:
  - `pnpm turbo build` passed.
  - Targeted integration tests for Transport behavior passed.
  - `pnpm -F @ludoforge/engine test` passed (270/270).
  - `pnpm turbo lint` passed.
