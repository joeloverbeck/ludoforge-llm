# FITLSEC4RULGAP-005: Bombard Player Choice for Troop Removal

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — data + tests only
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)

## Problem

Rule 4.4.2: "Remove 1 US or ARVN Troop cube from each selected location, if US, to the Casualties box."

The NVA player chooses which COIN Troop to remove (US vs ARVN). Currently, the `bombard-profile` `resolve-per-space` stage (lines ~4555-4581 in `30-rules-actions.md`) uses `removeByPriority` with a fixed US-first removal order, denying the NVA player agency.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` lines ~4561-4581 contain the `removeByPriority` block with US-first priority groups.
2. The kernel supports `chooseOne` for player-driven piece selection — used extensively in other profiles.
3. The kernel supports conditional destination routing (`if` on token props) — used in Subvert and elsewhere.
4. Existing Bombard tests in `fitl-nva-vc-special-activities.test.ts` and `fitl-capabilities-march-attack-bombard.test.ts` may assert `removeByPriority`. These must be updated.
5. Space eligibility logic (3+ COIN Troops or US/ARVN Base, adjacent 3+ NVA Troops) is in a separate legality stage and is NOT affected.

## Architecture Check

1. Replaces `removeByPriority` (automated) with `chooseOne` (player-driven) — a more accurate encoding of the rule that NVA decides.
2. Conditional destination routing (US → Casualties, ARVN → Available) uses standard `if`/`then`/`else` pattern already present in the DSL.
3. No new kernel primitives needed.
4. No backwards-compatibility shim introduced.

## What to Change

### 1. Replace removeByPriority with chooseOne

In `data/games/fire-in-the-lake/30-rules-actions.md`, `bombard-profile`, `resolve-per-space` stage:

Replace the `removeByPriority` block (~lines 4561-4581) with:

```yaml
- chooseOne:
    bind: $targetTroop
    options:
      query: tokensInZone
      zone: $space
      filter:
        - { prop: type, eq: troops }
        - { prop: faction, op: in, value: [US, ARVN] }
- if:
    when: { op: '==', left: { ref: tokenProp, token: $targetTroop, prop: faction }, right: US }
    then:
      - moveToken:
          token: $targetTroop
          from: { zoneExpr: { ref: tokenZone, token: $targetTroop } }
          to: { zoneExpr: 'casualties-US:none' }
    else:
      - moveToken:
          token: $targetTroop
          from: { zoneExpr: { ref: tokenZone, token: $targetTroop } }
          to: { zoneExpr: 'available-ARVN:none' }
```

This presents the NVA player with a choice of any US or ARVN Troop in the space, then routes the removed piece to the correct destination based on faction.

### 2. Preserve per-space iteration

The `forEach` over `targetSpaces` that wraps the resolution must remain. Only the inner removal logic changes.

### 3. Update tests

Update structural assertions from `removeByPriority` to `chooseOne`. Add runtime test verifying NVA player gets a choice.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — `bombard-profile` `resolve-per-space`, ~lines 4555-4581)
- `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` (modify — update Bombard removal assertions)
- `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` (modify — update any Bombard structural assertions referencing `removeByPriority`)

## Out of Scope

- Bombard space eligibility logic (3+ COIN Troops or Base, adjacent 3+ NVA Troops) — correct and unchanged.
- Capability interactions (`cap_longRangeGuns`) — correct and unchanged.
- NVA March or Attack profiles — separate concerns.
- Any kernel/compiler source code.

## Acceptance Criteria

### Tests That Must Pass

1. Structural test: Bombard `resolve-per-space` uses `chooseOne` (not `removeByPriority`) for troop removal.
2. Structural test: The `chooseOne` options include both US and ARVN Troops (faction filter uses `op: in` with `[US, ARVN]`).
3. Structural test: Conditional routing sends US Troops to `casualties-US:none` and ARVN Troops to `available-ARVN:none`.
4. Runtime test (if feasible): NVA player is presented with a choice when both US and ARVN Troops are present.
5. Budget of 1 removal per space is maintained.
6. `pnpm turbo build`
7. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. Space eligibility for Bombard is unchanged.
3. `cap_longRangeGuns` capability interaction is unchanged.
4. Budget: exactly 1 Troop removed per selected space.
5. Texas Hold'em compilation tests still pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` — assert Bombard uses `chooseOne` with faction-conditional routing.
2. `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` — update any `removeByPriority` assertions.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-nva-vc-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test -- fitl-capabilities-march-attack-bombard.test.ts`
4. `pnpm -F @ludoforge/engine test`
