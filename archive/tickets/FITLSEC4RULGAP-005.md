# FITLSEC4RULGAP-005: Bombard Player Choice for Troop Removal

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — data + tests only
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)

## Problem

Rule 4.4.2: "Remove 1 US or ARVN Troop cube from each selected location, if US, to the Casualties box."

The NVA player chooses which COIN Troop to remove (US vs ARVN). Currently, the `bombard-profile` `resolve-per-space` stage in `30-rules-actions.md` uses `removeByPriority` with a fixed US-first removal order, denying the NVA player agency.

## Assumption Reassessment (Updated 2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` `bombard-profile` `resolve-per-space` currently uses `removeByPriority` with US-first priority groups.
2. The kernel supports player-driven choice composition (`chooseOne` + `chooseN`) and robust per-space decision templating.
3. The current Bombard integration test in `fitl-nva-vc-special-activities.test.ts` verifies no die roll and US-to-casualties routing, but it does **not** verify player choice between US and ARVN when both are present.
4. `fitl-capabilities-march-attack-bombard.test.ts` currently validates `cap_longRangeGuns` selection caps and branch presence, and does **not** contain `removeByPriority`-specific assertions.
5. Space eligibility logic (3+ COIN Troops or US/ARVN Base, adjacent 3+ NVA Troops) is in separate legality/select stages and is NOT affected.
6. Bombard resolves per selected space, so decision binds must remain space-scoped (templated) to avoid collisions across multi-space Bombard selections.

## Architecture Check

1. Replacing `removeByPriority` with explicit player decision flow is a net architectural improvement: it models rule-authorized actor choice directly instead of encoding hidden policy priority.
2. Conditional destination routing (US → Casualties, ARVN → Available) remains data-driven and keeps kernel logic generic.
3. No new kernel/compiler primitives are required.
4. No backwards-compatibility shims or aliases are introduced.

## What to Change

### 1. Replace removeByPriority with per-space faction+troop choice routing

In `data/games/fire-in-the-lake/30-rules-actions.md`, `bombard-profile`, `resolve-per-space` stage:

Replace the `removeByPriority` block with a two-step per-space decision flow:

```yaml
- chooseOne faction (`$bombardFaction@{$space}`) from currently available troop factions (US/ARVN, or forced single option)
- chooseN exactly 1 troop (`$bombardTroops@{$space}`) from the selected faction
- route US selection to `casualties-US:none`
- route ARVN selection to `available-ARVN:none`
```

Notes:
- Decision binds are templated by `$space` to keep per-space resolution distinct.
- Budget remains exactly one removal per selected space because each loop iteration executes exactly one faction decision and one troop selection (`min=1`, `max=1`).

### 2. Preserve per-space iteration

The existing `forEach` over `targetSpaces` must remain. Only the inner removal logic changes.

### 3. Update tests

Update Bombard assertions to validate player choice behavior and routing:
- Explicitly select a US troop and assert US casualty routing.
- Explicitly select an ARVN troop and assert ARVN available routing.
- Keep no-die-roll assertion.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — `bombard-profile` `resolve-per-space`)
- `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` (modify — Bombard structural/runtime assertions)

## Out of Scope

- Bombard space eligibility logic (3+ COIN Troops or Base, adjacent 3+ NVA Troops)
- `cap_longRangeGuns` capability interaction logic
- NVA March or Attack profiles
- Any kernel/compiler source code
- `fitl-capabilities-march-attack-bombard.test.ts` unless Bombard structure assertions are intentionally expanded

## Acceptance Criteria

### Tests That Must Pass

1. Structural test: Bombard `resolve-per-space` no longer uses `removeByPriority`.
2. Structural test: Bombard includes space-scoped decision binds for faction and troop selection (`$bombardFaction@{$space}`, `$bombardTroops@{$space}`).
3. Structural test: options cover both US and ARVN troop factions when both are present.
4. Structural test: routing sends US to `casualties-US:none` and ARVN to `available-ARVN:none`.
5. Runtime test: when both US and ARVN troops are present, explicit US-vs-ARVN selections succeed and route correctly.
6. No die roll in Bombard resolution.
7. `pnpm turbo build`
8. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. Space eligibility for Bombard is unchanged.
3. `cap_longRangeGuns` interaction is unchanged.
4. Exactly 1 troop removed per selected space.
5. Texas Hold'em compilation tests still pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts`
   - Update Bombard test to assert faction+troop choice structure and faction-conditional routing.
   - Add runtime coverage for explicit US-vs-ARVN target selection outcomes.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-nva-vc-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - Updated `bombard-profile` resolution in `data/games/fire-in-the-lake/30-rules-actions.md` to remove fixed-priority removal.
  - Implemented per-space player-driven removal with a robust two-step choice:
    - choose faction (`US`/`ARVN`) based on actually present troop types in the space,
    - choose exactly one troop from that faction,
    - route removal to `casualties-US:none` for US or `available-ARVN:none` for ARVN.
  - Updated `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` to assert structural choice/routing behavior and runtime outcomes for explicit US vs ARVN selections.
- **Deviation from original plan**:
  - The original ticket sketch used one token-level `chooseOne` plus `tokenProp` checks on a templated token bind. In runtime this caused binding/type issues (`tokenProp` expects token bindings, while choice values normalize to token ids for params). The implemented split decision flow (`chooseOne` faction + `chooseN` one troop) preserves rule intent while remaining type-safe and per-space deterministic.
- **Verification**:
  - `pnpm turbo build` ✅
  - `pnpm turbo lint` ✅
  - `pnpm -F @ludoforge/engine test` ✅
