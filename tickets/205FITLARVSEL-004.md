# 205FITLARVSEL-004: P3 — Govern Patronage-availability term (§4.6)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — YAML game-data only
**Deps**: `tickets/205FITLARVSEL-001.md`

## Problem

The existing `arvn.governPatronageSpace` already encodes the Active-vs-Passive Support distinction via `activeSupportGovern` (weight 20) and `passiveSupportGovern` (weight 10) components (`data/games/fire-in-the-lake/92-agents.md:576-601`). Per spec §4.6, add one missing term: demote Govern when Patronage mode is unavailable (local ARVN cubes do not exceed US cubes). The doctrine "Active outscores Passive" already lands; the gap is "skip Govern when Patronage cannot fire."

## Assumption Reassessment (2026-06-01)

1. `arvn.governPatronageSpace` lives at `92-agents.md:570-611`. The Active-vs-Passive Support distinction is already authored — this ticket appends one component, it does NOT introduce the distinction.
2. Selector-scope `aggregate.op:count.query.tokensInZone` authoring shape is confirmed by 205FITLARVSEL-001's vocabulary baseline. **Re-read `reports/205-fitl-arvn-selector-vocabulary-baseline.md` for the canonical selector-scope wrapper before authoring the new component.**
3. Faction-token filters (`prop: faction, op: in, value: [...]`) exist at `92-agents.md:2009`. Type filters (`prop: type, op: in, value: [...]`) await P0 confirmation against the token-type vocabulary (specifically whether 'troop' and 'police' are canonical type tags or named differently).
4. No engine surface change required; `aggregate` is a `KnownOperator` per `packages/engine/src/agents/policy-expr.ts`.

## Architecture Check

1. Single additive component to an existing well-authored selector — minimum-impact change (Foundation #15).
2. Uses existing operators only (`boolToNumber`, `aggregate`, `gt`); no new authoring constructs (Foundation #1, #7).
3. Preserves existing components verbatim — no churn (Foundation #14, no aliases).
4. The new witness asserts the Patronage-unavailable demotion as an architectural property (Foundation #16).

## What to Change

### 1. Append `arvnCubesExceedUsCubes` component to `arvn.governPatronageSpace`

In `data/games/fire-in-the-lake/92-agents.md` insert into `arvn.governPatronageSpace.quality.components` after the existing `governPopulation` component (around line 609, before `order: qualityDesc` at line 610):

```yaml
- id: arvnCubesExceedUsCubes
  value:
    boolToNumber:
      gt:
        - aggregate:
            op: count
            query:
              query: tokensInZone
              zone: { zoneExpr: { ref: selector.item.key } }
              filter:
                op: and
                args:
                  - { prop: faction, op: eq, value: 'ARVN' }
                  - { prop: type, op: in, value: ['troop', 'police'] }
        - aggregate:
            op: count
            query:
              query: tokensInZone
              zone: { zoneExpr: { ref: selector.item.key } }
              filter:
                op: and
                args:
                  - { prop: faction, op: eq, value: 'US' }
                  - { prop: type, op: in, value: ['troop'] }
  weight: 6
```

Resolve the selector-scope `aggregate.query.zone` wrapper per the 205FITLARVSEL-001 baseline if the canonical shape differs from the example above. Confirm token-type tags `'troop'` and `'police'` against the FITL piece catalog before committing.

### 2. Author the new Patronage-availability witness

Create `packages/engine/test/policy-profile-quality/arvn-govern-patronage-unavailable-demotes.test.ts` with `// @test-class: architectural-invariant`. Witness asserts: given two candidate Govern targets identical in Support state and population, the one where ARVN cubes do NOT exceed US cubes scores strictly lower than the one where they do.

Use existing test helpers in `packages/engine/test/policy-profile-quality/arvn-plan-witness-helpers.ts` for state setup.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify) — append component to `arvn.governPatronageSpace.quality.components`
- `packages/engine/test/policy-profile-quality/arvn-govern-patronage-unavailable-demotes.test.ts` (new)
- `reports/205-fitl-arvn-selector-vocabulary-baseline.md` (consume; produced by 205FITLARVSEL-001)

## Out of Scope

- Modifying existing `activeSupportGovern` / `passiveSupportGovern` / `governPopulation` components in `arvn.governPatronageSpace`.
- Renaming `arvn.governPatronageSpace`.
- Selector body replacements for the 5 placeholder selectors (§§4.1–4.4, 4.7 — owned by 205FITLARVSEL-002).
- Introducing any new Active-vs-Passive Support component (already authored — spec §2 Non-Goal).

## Acceptance Criteria

### Tests That Must Pass

1. New witness `arvn-govern-patronage-unavailable-demotes.test.ts` proves the demotion property.
2. Existing `arvn-govern-active-support-priority.test.ts` continues to pass (Active > Passive scoring preserved).
3. All 10 existing ARVN witnesses pass.
4. `pnpm turbo build` succeeds; full engine test suite passes.

### Invariants

1. Existing `arvn.governPatronageSpace` components (`activeSupportGovern`, `passiveSupportGovern`, `governPopulation`) are untouched (append-only).
2. Foundation #1 — no engine code changes.
3. The new component's `weight: 6` is calibrated below `activeSupportGovern` (weight 20) so Active Support priority is not inverted.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/arvn-govern-patronage-unavailable-demotes.test.ts` (new, `@test-class: architectural-invariant`).

### Commands

1. `pnpm turbo build`
2. `node --test dist/test/policy-profile-quality/arvn-govern-patronage-unavailable-demotes.test.js`
3. `node --test dist/test/policy-profile-quality/arvn-govern-active-support-priority.test.js`
4. `node --test dist/test/policy-profile-quality/arvn-patrol-govern-over-train-when-threatened.test.js`
5. `node --test dist/test/policy-profile-quality/arvn-train-govern-fallback.test.js`
6. `node --test dist/test/policy-profile-quality/arvn-train-govern-separation.test.js`
7. `pnpm turbo test`
8. `pnpm turbo lint && pnpm turbo typecheck`
