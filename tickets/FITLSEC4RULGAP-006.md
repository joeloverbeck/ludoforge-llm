# FITLSEC4RULGAP-006: Tax Pop-0 Support Shift Fix

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)

## Problem

Rule 4.5.1: "If a Province or City, shift it 1 level toward Active Support."

The `tax-profile` `resolve-per-space` stage (lines ~4691-4698 in `30-rules-actions.md`) conditions the support shift on `pop > 0`. The rules say "If a Province or City" with no population threshold. A Population 0 Province with Passive Support should still shift toward Active Support during Tax.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` lines ~4691-4698 contain the support shift condition: `op: and` with `pop > 0` AND `!= activeSupport`.
2. The LoC check is handled by an outer `if` at line ~4676 — the support shift branch only runs for non-LoC spaces (Provinces/Cities), which is correct.
3. Population 0 Provinces exist on the FITL map (e.g., some Highland provinces) — this is not purely theoretical.
4. Existing Tax tests in `fitl-us-arvn-special-activities.test.ts` may assert the `pop > 0` condition. These must be updated.

## Architecture Check

1. Single condition simplification in GameSpecDoc YAML — removes `pop > 0` from an `and` clause.
2. The outer LoC gating is already correct and ensures this only applies to Provinces/Cities.
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

Update structural assertion to verify the simplified condition. Add a runtime test verifying Tax shifts support in a Population 0 Province.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — `tax-profile` support shift condition, ~lines 4691-4698)
- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify — update Tax support shift assertions)

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
3. Runtime test (if feasible): Tax in a Population 0 Province with Passive Support shifts it 1 level toward Active Support.
4. Runtime test (if feasible): Tax in a Province already at Active Support does NOT shift further (no-op).
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

1. `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` — assert Tax support shift condition is `!= activeSupport` only (no `pop > 0`).

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test`
