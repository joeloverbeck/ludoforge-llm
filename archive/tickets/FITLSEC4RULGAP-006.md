# FITLSEC4RULGAP-006: Tax Pop-0 Support Shift Fix

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)

## Problem

Rule 4.5.1: "If a Province or City, shift it 1 level toward Active Support."

The `tax-profile` `resolve-per-space` stage (lines ~4691-4698 in `30-rules-actions.md`) conditions the support shift on `pop > 0`. The rules say "If a Province or City" with no population threshold. A Population 0 Province with Passive Support should still shift toward Active Support during Tax.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` lines ~4663-4666 currently gate Tax support shift with `op: and` (`population > 0` and `!= activeSupport`).
2. The LoC vs Province/City split is already encoded by the outer `if category == loc` branch, so the support-shift branch only runs for non-LoC spaces.
3. Population 0 Provinces are present in the FITL map data (for example `central-laos:none`, `southern-laos:none`, `the-fishhook:none`), so this rule gap is live.
4. Tax tests live in `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` (not US/ARVN test file). Current coverage validates population>0 province shift but does not cover pop-0 province shift or active-support no-op.

## Architecture Check

1. Single condition simplification in GameSpecDoc YAML — removes `pop > 0` from an `and` clause.
2. The outer LoC gating is already correct and ensures this remains Province/City-only without introducing new branching.
3. No backwards-compatibility shim introduced.

## What to Change

### 1. Remove pop > 0 condition from Tax support shift

In `data/games/fire-in-the-lake/30-rules-actions.md`, `tax-profile`, `resolve-per-space` stage, support shift:

Change from:
```yaml
- if:
    when:
      op: and
      args:
        - { op: '>', left: { ref: zoneProp, zone: $space, prop: population }, right: 0 }
        - { op: '!=', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeSupport }
    then:
      - shiftMarker: { space: $space, marker: supportOpposition, delta: 1 }
```

To:
```yaml
- if:
    when: { op: '!=', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeSupport }
    then:
      - shiftMarker: { space: $space, marker: supportOpposition, delta: 1 }
```

The `and` wrapper and `pop > 0` arg are removed. Only the `activeSupport` guard remains.

### 2. Update tests

Update/add Tax tests in `fitl-nva-vc-special-activities.test.ts`:
1. Structural assertion verifies Tax support-shift condition is only `!= activeSupport` (no `population` guard).
2. Runtime test verifies Tax shifts support in a Population 0 Province.
3. Runtime test verifies Tax in an already Active Support Province does not shift further.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — `tax-profile` support shift condition, ~lines 4691-4698)
- `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` (modify — Tax structural + runtime assertions)

## Out of Scope

- Tax resource gain logic — correct and unchanged.
- Tax LoC branch (resource gain only, no support shift) — correct and unchanged.
- ARVN Tax cost/eligibility — correct and unchanged.
- Any kernel/compiler source code.
- Other profiles or special activities.

## Acceptance Criteria

### Tests That Must Pass

1. Structural test: Tax `resolve-per-space` support shift condition does NOT reference `population` or `pop > 0`.
2. Structural test: Tax support shift still has the `!= activeSupport` guard.
3. Runtime test: Tax in a Population 0 Province with Passive Support shifts it 1 level toward Active Support.
4. Runtime test: Tax in a Province already at Active Support does NOT shift further (no-op).
5. Existing test: Tax in Population > 0 Provinces behaves identically to before.
6. `pnpm turbo build`
7. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. LoC spaces still skip the support shift (outer branch handles this).
3. Resource gain logic in Tax is unchanged.
4. Texas Hold'em compilation tests still pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` — add structural assertion for Tax support-shift condition.
2. `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` — add runtime Tax pop-0 Province shift coverage.
3. `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` — add runtime Tax active-support no-op coverage.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-nva-vc-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - Removed the `population > 0` gate from `tax-profile` support-shift logic in `data/games/fire-in-the-lake/30-rules-actions.md`.
  - Added Tax structural coverage in `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` asserting the support-shift guard is only `!= activeSupport` and contains no population reference.
  - Added runtime Tax edge-case coverage for:
    - Population-0 Province support shift (`passiveSupport` -> `activeSupport`).
    - Active Support no-op (no shift beyond `activeSupport`).
- **Deviation from original plan**:
  - Ticket originally targeted `fitl-us-arvn-special-activities.test.ts`; actual and correct Tax coverage location is `fitl-nva-vc-special-activities.test.ts`.
  - Existing command intended as targeted execution (`pnpm -F @ludoforge/engine test -- fitl-nva-vc-special-activities.test.ts`) still executes the full engine test matrix under current package script wiring.
- **Verification**:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test -- fitl-nva-vc-special-activities.test.ts` passed (full engine suite executed; 270/270 passing).
  - `pnpm turbo lint` passed.
