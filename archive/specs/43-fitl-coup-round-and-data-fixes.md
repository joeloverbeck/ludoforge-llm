# Spec 43: FITL Coup Round Phase Sequence & Data Fixes

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: Specs 23-28 (all completed), 90-terminal.md (victory logic)
**Estimated effort**: 5-7 days
**Source sections**: Rules Section 6.0-6.7, Rules Section 2.4

## Overview

This spec addresses two gaps identified in the Section 2 + Section 6 gap analysis:

1. **Data value error**: `totalEcon` is set to 10 in all three scenarios; the rules specify 15 for all three (Short, Medium, Full).
2. **Coup Round phase sequence**: The entire Section 6.0 Coup Round mechanic — a 6-phase structured sequence (Victory, Resources, Support, Redeploy, Commitment, Reset) — is not yet implemented.

All changes are **data-only YAML** modifications in `data/games/fire-in-the-lake/`. No engine code changes are required — the kernel's `advanceToDecisionPoint` function already auto-skips phases with zero legal moves, making the coup-specific phases seamlessly inactive during normal event card turns.

---

## Part 1: Gap Analysis Summary

### What's Implemented (Section 2 — Turn Flow)

The FITLRULES2 ticket series (001-006) thoroughly implemented the Section 2 turn-flow mechanics:

| Rule | Status | Implementation |
|------|--------|---------------|
| 2.0 Sequence of Play | Done | `turnStructure`, `turnOrder` in 30-rules-actions.md |
| 2.1 Set Up | Done | Three scenarios with deck composition, initial placements |
| 2.2 Start / Card reveal | Done | `cardLifecycle` with played/lookahead/leader zones |
| 2.3 Event Card flow | Done | Eligibility, faction order, passing, options matrix |
| 2.3.1 Eligibility | Done | Eligibility tracking with override windows |
| 2.3.2 Faction Order | Done | Left-to-right order per card symbols |
| 2.3.3 Passing | Done | Pass resources (+1 insurgent, +3 ARVN for COIN) |
| 2.3.4 Options (1st/2nd) | Done | Option matrix with special activity coupling |
| 2.3.5 Limited Operation | Done | `__actionClass: limitedOperation` throughout actions |
| 2.3.6 Adjust Eligibility | Done | Post-action eligibility adjustment |
| 2.3.7 Next Card | Done | Card draw and reveal mechanics |
| 2.3.8 Pivotal Events | Done | Trumping hierarchy, preconditions, interrupts |
| 2.3.9 Monsoon Season | Done | Sweep/March ban, Air Strike/Air Lift limits |
| 2.4 Coup Card handling | Partial | Leader stack and immediate effects handled; **Coup Round phases missing** |
| 2.4.1 RVN Leader | Done | `activeLeader` global marker, leader stack zones |
| 2.4.2 Final Coup | Done | `final-coup-ranking` in 90-terminal.md |

### What's Missing

| Gap | Severity | Section |
|-----|----------|---------|
| `totalEcon` = 10 (should be 15) | Data error | 2.1 / 6.2.3 |
| Coup Round phase sequence | Major feature gap | 6.0-6.6 |
| Consecutive coup guard | Minor | 6.0 exception |
| Victory check during coup | Partially done | 6.1 (90-terminal.md has timing but no phase gate) |
| Resources phase (sabotage, earnings) | Not implemented | 6.2 |
| Support phase (pacification, agitation) | Not implemented | 6.3 |
| Redeploy phase | Not implemented | 6.4 |
| Commitment phase | Not implemented | 6.5 |
| Reset phase | Not implemented | 6.6 |

---

## Part 2: Data Fix — totalEcon

### Problem

All three scenarios set `totalEcon: 10`. The rules (Section 2.1 scenario pages and Section 6.2.3) clearly state Total Econ = 15 for all scenarios.

The Total Econ value represents the sum of all LoC economic values on the map when none are sabotaged. Counting econ values from `fitl-map-production`:
- `loc-hue-khe-sanh`: econ 1
- `loc-hue-da-nang`: econ 1
- `loc-da-nang-dak-to`: econ 0
- `loc-da-nang-qui-nhon`: econ 1
- `loc-kontum-dak-to`: econ 1
- `loc-kontum-qui-nhon`: econ 1
- `loc-kontum-ban-me-thuot`: econ 1
- `loc-qui-nhon-cam-ranh`: econ 1
- `loc-cam-ranh-da-lat`: econ 1
- `loc-ban-me-thuot-da-lat`: econ 0
- `loc-saigon-cam-ranh`: econ 1
- `loc-saigon-da-lat`: econ 1
- `loc-saigon-an-loc-ban-me-thuot`: econ 1
- `loc-saigon-can-tho`: econ 2
- `loc-can-tho-chau-doc`: econ 1
- `loc-can-tho-bac-lieu`: econ 0
- `loc-can-tho-long-phu`: econ 1

**Total = 15** (matching the rules).

### Fix

In `data/games/fire-in-the-lake/40-content-data-assets.md`, change `totalEcon` initial value from 10 to 15 in all three scenario assets:
- `fitl-scenario-full` → `totalEcon: 15`
- `fitl-scenario-short` → `totalEcon: 15`
- `fitl-scenario-medium` → `totalEcon: 15`

---

## Part 3: Coup Round Architecture

### Key Engine Capability: `advanceToDecisionPoint`

The kernel's `advanceToDecisionPoint` (`packages/engine/src/kernel/phase-advance.ts:146`) automatically skips phases with no legal moves. This means coup-specific phases can be added to `turnStructure.phases` and they will be auto-skipped during non-coup event card turns — no engine changes required.

### Phase Sequence

Extend `turnStructure.phases` from:
```yaml
phases:
  - id: main
```

To:
```yaml
phases:
  - id: main
  - id: coupVictory
  - id: coupResources
  - id: coupSupport
  - id: coupRedeploy
  - id: coupCommitment
  - id: coupReset
```

### How It Works

- **During normal event card turns**: All coup phases have zero legal moves (their actions require `isCoupRound == true` or equivalent precondition). `advanceToDecisionPoint` skips them all. Turn ends, next card drawn.
- **During coup card turns**: A trigger on coup card entry sets `isCoupRound` flag (or equivalent). Coup phase actions become available. Players make choices (Support, Redeploy, Commitment) or automatic effects fire (Victory check, Resources, Reset).

### Phase Classification

| Phase | Type | Player Actions? | Description |
|-------|------|----------------|-------------|
| main | Interactive | Yes | Normal event card play (existing) |
| coupVictory | Automatic | No | Check victory conditions; end game if met |
| coupResources | Automatic | No | Sabotage spreading, trail degradation, earnings, casualties/aid |
| coupSupport | Interactive | Yes | US/ARVN pacification choices, VC agitation choices |
| coupRedeploy | Interactive | Yes | ARVN troop/police redeployment choices, NVA troop redeployment |
| coupCommitment | Interactive | Yes | US troop/base movement choices (non-final rounds only) |
| coupReset | Automatic | No | Trail normalization, marker removal, guerrilla flip, eligibility reset |

### New Global Variables Required

Add to `10-vocabulary.md` → `globalVars`:

```yaml
- name: isCoupRound
  type: boolean
  init: false

- name: coupSupportSpacesUsed
  type: int
  init: 0
  min: 0
  max: 4

- name: coupAgitationSpacesUsed
  type: int
  init: 0
  min: 0
  max: 4

- name: coupUsTroopsMoved
  type: int
  init: 0
  min: 0
  max: 10

- name: coupUsBasesMoved
  type: int
  init: 0
  min: 0
  max: 2
```

---

## Part 4: Coup Phase Detailed Requirements

### 4.0 Entry Conditions (Rule 6.0)

**Trigger**: When a Coup card is played (detected by `isCoup` property on the card token).

**Consecutive Coup Exception**: If the previously played card was also a Coup card (i.e., two coup cards in a row), do NOT conduct a Coup Round. The coup card's immediate effects (RVN Leader change) still apply, but skip phases 6.1-6.6.

**Implementation**: Add a trigger on coup card entry that:
1. Checks if previous card was also a coup (count coup cards in `played:none` with sequential position check, or use a `consecutiveCoupSkip` flag).
2. If consecutive: set `isCoupRound = false` (phases auto-skip).
3. If not consecutive: set `isCoupRound = true` (phases activate).
4. Process immediate coup card effects (already handled by event card wiring).

### 4.1 Victory Phase (Rule 6.1)

**Rule**: If any Faction has met its Victory condition, the game ends.

**Current state**: Victory conditions are already defined in `90-terminal.md` with `timing: duringCoup`. The kernel's terminal check infrastructure should already evaluate these.

**Remaining work**: Ensure the `duringCoup` timing triggers at the start of the `coupVictory` phase. If the kernel already checks terminal conditions between phases (via `advanceToDecisionPoint` calling `terminalResult`), this may already work. Verify and add a phase-enter trigger if needed.

**Final Coup (Rule 6.4.5 / 2.4.2)**: After the Redeploy phase of the FINAL coup round (last coup card), if no victory was achieved, determine winner by margin ranking. This is handled by `final-coup-ranking` in `90-terminal.md`.

### 4.2 Resources Phase (Rule 6.2)

This phase is fully automatic — no player choices. Implement via `onPhaseEnter` effects on the `coupResources` phase (or as actions with auto-resolve).

#### 4.2.1 Sabotage Spreading (Rule 6.2.1)

Sabotage each unSabotaged LoC where:
- Insurgent guerrillas (NVA + VC) outnumber COIN pieces (US + ARVN), OR
- LoC is adjacent to a City without COIN Control

Continue until no sabotage markers remain (15 total shared between terror/sabotage). VC chooses which spaces first when markers are limited.

**Note**: This requires iterating over LoCs and checking piece counts. Since VC chooses ordering when markers are scarce, this may need a player choice if `terrorSabotageMarkersPlaced < 15` and multiple eligible LoCs exist but not enough markers for all.

#### 4.2.2 Trail Degradation (Rule 6.2.2)

If any Laos or Cambodia space is COIN-Controlled, degrade the Trail by 1 (decrease `trail` by 1, minimum 0).

**Implementation**: Simple conditional `addVar` on `trail`.

#### 4.2.3 ARVN Earnings (Rule 6.2.3)

1. Add `aid` value to `arvnResources` (max 75).
2. Calculate unSabotaged Econ = 15 minus Econ of Sabotaged LoCs.
3. Add unSabotaged Econ to `arvnResources`.
4. Update `totalEcon` to reflect current unSabotaged Econ value (for US spending limit during next campaign per Rule 1.8.1).

**Implementation**: Iterate over LoCs, sum econ for non-sabotaged ones, add to arvnResources, update totalEcon.

#### 4.2.4 Insurgent Earnings (Rule 6.2.4)

- **VC**: Add count of VC Bases on the map to `vcResources`.
- **NVA**: Add (NVA Bases in Laos/Cambodia) + (2 * trail value) to `nvaResources`.

**Implementation**: Aggregate queries for base counts, simple arithmetic.

#### 4.2.5 Casualties & Aid (Rule 6.2.5)

Subtract from `aid`: 3 * (number of pieces in `casualties-US:none`).

Then move all pieces from `casualties-US:none` to `out-of-play-US:none` (this happens in Commitment phase 6.5, but the aid reduction happens here).

**Note**: Only the aid subtraction happens in 6.2.5. The actual piece handling for casualties occurs in 6.5 (Commitment).

### 4.3 Support Phase (Rule 6.3) — Interactive

This phase requires player choices from US, ARVN, and VC.

#### 4.3.1 Pacification (Rule 6.3.1)

**Combined limit**: US and ARVN together may pacify in up to 4 spaces total.

**US Pacification**:
- Choose spaces (up to 4) with: COIN Control + Police + US Troops.
- Per space: spend 3 ARVN Resources (4 if Ky is active leader) to either remove 1 Terror marker or shift 1 level toward Active Support.
- Max 2 levels shift per space per Support Phase (not per faction).
- US may not spend ARVN Resources below `totalEcon` (Rule 1.8.1).

**ARVN Pacification**:
- Choose spaces (up to `4 - US_pacification_count`) with: COIN Control + Police + ARVN Troops.
- Same cost and shift rules as US.
- ARVN resources minimum 0 (standard).

**Implementation**: Define `coupPacifyUS` and `coupPacifyARVN` actions restricted to `coupSupport` phase. Track combined count via `coupSupportSpacesUsed`. Actions have preconditions checking COIN Control, Police presence, Troop presence, resource availability, and combined space limit.

#### 4.3.2 Agitation (Rule 6.3.2)

**VC Agitation**:
- Choose up to 4 spaces with VC pieces and no COIN Control.
- Per space: spend 1 VC Resource to either remove 1 Terror marker or shift 1 level toward Active Opposition.
- Max 2 levels shift per space per Support Phase.

**Implementation**: Define `coupAgitateVC` action restricted to `coupSupport` phase.

### 4.4 Redeploy Phase (Rule 6.4) — Interactive

#### 4.4.1 Laos/Cambodia Removal (Rule 6.4.1)

**Automatic**: Remove ALL US and ARVN pieces from Laos and Cambodia.
- US Troops → out-of-play
- All other US/ARVN pieces → their Available boxes

#### 4.4.2 ARVN Redeploy (Rule 6.4.2)

**Mandatory moves**: ARVN Troops on LoCs and Provinces without COIN Bases MUST be moved.

**Destinations**: Any Cities without NVA Control, any US or ARVN Bases, or Saigon.

**Optional moves**: ARVN may also move any other ARVN Troops to those destinations.

**Then**: ARVN may move any Police to any LoCs or COIN-Controlled spaces within South Vietnam.

**Implementation**: Multi-step choice sequence. Mandatory troop redeployment first, then optional troop moves, then optional police moves.

#### 4.4.3 NVA Redeploy (Rule 6.4.3)

NVA may move NVA Troops (only, not guerrillas/bases) from any map spaces to any NVA Bases (even if COIN-Controlled).

#### 4.4.4 Control Adjustment (Rule 6.4.4)

After all Redeploy moves, recalculate COIN and NVA Control markers.

**Note**: Control is a derived value in the kernel. If the kernel auto-recalculates control after state changes, this is already handled. If not, explicit control recalculation effects are needed.

#### 4.4.5 Game End Check (Rule 6.4.5)

If this is the FINAL Coup Round, end the game after Redeploy. Determine victory by margin ranking (7.3). This is handled by `final-coup-ranking` in `90-terminal.md` — ensure it fires after Redeploy phase completion on the final coup.

### 4.5 Commitment Phase (Rule 6.5) — Interactive (non-final rounds only)

**Skipped on final Coup Round** — only runs if this is not the last coup card.

**Steps**:
1. Take 1 in 3 (round down) US Troop casualties out of play. All Base casualties go out of play. Put remaining US casualties into Available.
2. US may move up to 10 US Troops and 2 US Bases among: US Available, COIN-Controlled spaces, LoCs, and Saigon.
3. Adjust Control and Victory markers.

**Implementation**: Multi-step:
- Automatic: Process casualties (1/3 troops to out-of-play, bases to out-of-play, rest to available).
- Interactive: US chooses troop/base movements within limits.
- Automatic: Control recalculation.

### 4.6 Reset Phase (Rule 6.6) — Automatic

All steps are deterministic — no player choices:

1. **Trail normalization**: If trail = 0, set to 1. If trail = 4, set to 3.
2. **Remove markers**: Remove ALL Terror and Sabotage markers. Reset `terrorSabotageMarkersPlaced` to 0.
3. **Flip guerrillas/SF**: Set ALL Guerrillas (NVA + VC) and US Irregulars/ARVN Rangers to Underground.
4. **Momentum discard**: Set all `mom_*` boolean variables to false.
5. **Eligibility reset**: Mark all Factions Eligible.
6. **Clear coup flag**: Set `isCoupRound = false` and reset coup-phase counters.
7. **Next card**: Play the next card from the draw deck and reveal the new top card.

---

## Part 5: Reusable Macros

Add to `20-macros.md`:

### coup-auto-sabotage

Iterates all LoCs, applies sabotage where insurgent guerrillas outnumber COIN pieces or LoC is adjacent to a city without COIN Control. Respects 15-marker cap.

### coup-arvn-earnings

Calculates unSabotaged Econ sum, adds Aid + Econ to ARVN Resources, updates `totalEcon` marker.

### coup-insurgent-earnings

Calculates VC base count and NVA Laos/Cambodia base count + trail bonus. Adds to respective resources.

### coup-laos-cambodia-removal

Removes all US/ARVN from Laos/Cambodia spaces. US Troops to out-of-play, others to Available.

### coup-process-casualties

Handles Commitment Phase casualty processing: 1/3 troops out of play, bases out of play, rest to available.

### coup-reset-markers

Removes all Terror/Sabotage markers, flips all guerrillas and SF underground, clears momentum flags, resets eligibility.

---

## Part 6: Files to Modify

| File | Changes |
|------|---------|
| `data/games/fire-in-the-lake/40-content-data-assets.md` | Fix `totalEcon` from 10 → 15 in all 3 scenarios |
| `data/games/fire-in-the-lake/10-vocabulary.md` | Add `isCoupRound`, `coupSupportSpacesUsed`, `coupAgitationSpacesUsed`, `coupUsTroopsMoved`, `coupUsBasesMoved` global vars |
| `data/games/fire-in-the-lake/30-rules-actions.md` | Add 6 coup phases to `turnStructure.phases`; add coup-phase actions (pacify, agitate, redeploy, commit); add triggers/lifecycle effects for automatic phases |
| `data/games/fire-in-the-lake/20-macros.md` | Add reusable macros for coup-phase logic |
| `data/games/fire-in-the-lake/90-terminal.md` | Verify `duringCoup` timing works with new phase structure; potentially add `finalCoup` after-redeploy check |

---

## Part 7: Ticket Breakdown

### FITLCOUP-000: Fix totalEcon Data Error

**Priority**: P0 (data bug)
**Complexity**: XS
**Files**: `40-content-data-assets.md`
**Changes**: Change `totalEcon` from 10 to 15 in `fitl-scenario-full`, `fitl-scenario-short`, `fitl-scenario-medium`.
**Verification**: Compile all 3 scenarios, inspect `initialTrackValues` for `totalEcon: 15`.

### FITLCOUP-001: Add Coup Phase Structure and Global Variables

**Priority**: P0 (foundation)
**Complexity**: S
**Files**: `30-rules-actions.md`, `10-vocabulary.md`
**Changes**:
- Add 6 coup phase IDs to `turnStructure.phases`
- Add `isCoupRound` and coup-phase counter global vars
- Add trigger on coup card entry to set/clear `isCoupRound`
- Add consecutive coup guard logic

**Verification**: Compile spec; existing tests pass; non-coup turns still work (phases auto-skipped).

### FITLCOUP-002: Resources Phase — Automatic Effects

**Priority**: P1
**Complexity**: M
**Depends on**: FITLCOUP-001
**Files**: `30-rules-actions.md`, `20-macros.md`
**Changes**:
- Implement sabotage spreading (6.2.1) with VC choice on marker scarcity
- Trail degradation check (6.2.2)
- ARVN earnings with Aid + unSabotaged Econ (6.2.3)
- Insurgent earnings for VC and NVA (6.2.4)
- Casualties/Aid reduction (6.2.5)

**Verification**: Unit tests for each earnings calculation; sabotage marker cap respected.

### FITLCOUP-003: Support Phase — Pacification and Agitation

**Priority**: P1
**Complexity**: L
**Depends on**: FITLCOUP-001
**Files**: `30-rules-actions.md`, `20-macros.md`
**Changes**:
- `coupPacifyUS` action: space selection, resource cost (3 or 4 with Ky), terror removal / support shift
- `coupPacifyARVN` action: same mechanics, shared 4-space limit
- `coupAgitateVC` action: space selection, 1-resource cost, terror removal / opposition shift
- 2-level-per-space cap enforcement
- US spending floor at `totalEcon` (Rule 1.8.1)

**Verification**: Test combined US+ARVN space limit; Ky cost modifier; 2-level cap; resource floor.

### FITLCOUP-004: Redeploy Phase

**Priority**: P1
**Complexity**: L
**Depends on**: FITLCOUP-001
**Files**: `30-rules-actions.md`, `20-macros.md`
**Changes**:
- Automatic Laos/Cambodia removal (6.4.1)
- ARVN mandatory + optional troop redeployment (6.4.2)
- ARVN police redeployment (6.4.2)
- NVA troop redeployment (6.4.3)
- Control adjustment (6.4.4)
- Final-coup game-end check (6.4.5)

**Verification**: Mandatory moves enforced; destination constraints validated; control recalculated.

### FITLCOUP-005: Commitment Phase

**Priority**: P1
**Complexity**: M
**Depends on**: FITLCOUP-001
**Files**: `30-rules-actions.md`, `20-macros.md`
**Changes**:
- Skip on final coup round
- Casualty processing: 1/3 troops + all bases out of play, rest to available
- US movement: up to 10 troops and 2 bases among Available/COIN spaces/LoCs/Saigon
- Control and victory marker adjustment

**Verification**: Rounding correct (floor); final-round skip works; movement limits enforced.

### FITLCOUP-006: Reset Phase

**Priority**: P1
**Complexity**: M
**Depends on**: FITLCOUP-002 through FITLCOUP-005
**Files**: `30-rules-actions.md`, `20-macros.md`
**Changes**:
- Trail normalization (0→1, 4→3)
- Remove all Terror and Sabotage markers
- Flip all Guerrillas and SF Underground
- Clear Momentum cards
- Reset all Factions to Eligible
- Clear `isCoupRound` and coup counters
- Advance to next card

**Verification**: All markers cleared; all guerrillas underground; all factions eligible; trail normalized.

---

## Part 8: Verification Plan

### Build Verification

```bash
pnpm turbo build          # Compilation succeeds
pnpm turbo test           # Existing tests pass (no engine changes)
pnpm turbo typecheck      # Type checking passes
```

### Spec Compilation

Compile the FITL production spec and verify:
1. `turnStructure.phases` includes all 7 phases (main + 6 coup)
2. `totalEcon = 15` in all compiled scenario data
3. New global variables appear in compiled GameDef
4. Coup phase actions appear with correct phase restrictions
5. Automatic phase effects (Resources, Reset) are properly wired

### Functional Verification

For each ticket:
- Compile and inspect GameDef JSON output for correct structure
- Run existing tests to verify no regressions
- Where possible, construct targeted test scenarios that exercise coup round logic

### Integration Verification

- Full game simulation with coup cards should trigger the coup phase sequence
- Non-coup turns should behave identically to current behavior (phases auto-skipped)
- Victory detection during coup rounds should work correctly
- Resource calculations should produce values consistent with rules examples

---

## Appendix A: Rules Reference Summary

### Section 6.0 — Coup Rounds

> Conduct a Coup Round in the sequence of phases below as each Coup Card is played, first following any immediate Coup effect (2.4) and adjusting Control (1.7).

> EXCEPTION: Never conduct more than 1 Coup Round in a row (without at least 1 Event card in between)

### Section 6.1 — Victory Phase
> If any Faction has met its Victory condition, the game ends.

### Section 6.2 — Resources Phase
> 6.2.1 Sabotage: Sabotage each unSabotaged LoC where Insurgent Guerrillas outnumber COIN pieces or adjacent to a City without COIN Control.
> 6.2.2 Degrade Trail: If any Laos or Cambodia space is COIN-Controlled, Degrade the Trail by 1.
> 6.2.3 ARVN Earnings: Add Aid + unSabotaged Econ to ARVN Resources.
> 6.2.4 Insurgent Earnings: VC = VC Bases on map; NVA = NVA Bases in Laos/Cambodia + 2x Trail.
> 6.2.5 Casualties and Aid: Subtract from Aid 3x pieces in Casualties box.

### Section 6.3 — Support Phase
> 6.3.1 Pacification: US then ARVN, combined 4 spaces, COIN Control + Police + Troops, 3 ARVN Resources per shift (4 with Ky), max 2 levels per space.
> 6.3.2 Agitation: VC, up to 4 spaces with VC pieces and no COIN Control, 1 VC Resource per shift, max 2 levels per space.

### Section 6.4 — Redeploy Phase
> 6.4.1 Remove all US/ARVN from Laos/Cambodia (US Troops to out of play, others to Available).
> 6.4.2 ARVN must move Troops from LoCs/Provinces without COIN Bases; may move others and Police.
> 6.4.3 NVA may move NVA Troops to any NVA Bases.
> 6.4.4 Adjust Control.
> 6.4.5 If final Round, end game.

### Section 6.5 — Commitment Phase (non-final only)
> Take 1 in 3 (round down) US Troop casualties out of play. All Base casualties out of play. Rest to Available. US may move up to 10 Troops and 2 Bases.

### Section 6.6 — Reset Phase
> Trail: 0→1, 4→3. Remove all Terror/Sabotage. Flip all Guerrillas/SF Underground. Discard Momentum. All Eligible. Next card.

### Section 6.7 — The Trail
> Track from 0-4, affects NVA Rally, March, Infiltration, and Earnings.

---

## Outcome

- Completion date: 2026-02-23
- What was actually changed:
  - Delivered the coup round phase sequence and runtime gating through production data (`coupPlan`, phase actions, phase-enter automation).
  - Implemented/verified Rule 6 phases across targeted production integration suites:
    - victory gating and final-coup ranking
    - resources (including `totalEcon`/aid/trail/econ calculations)
    - support, redeploy, commitment, reset
    - consecutive-coup suppression
  - Updated scenario `totalEcon` values to 15 and verified them in production data/tests.
  - Synced runner bootstrap fixtures against current production FITL compilation.
- Deviations from original plan:
  - The final architecture uses generic card-driven coup runtime (`consecutiveCoupRounds` and `coupPlan`) instead of spec-draft language around FITL-specific globals like `isCoupRound`.
  - Verification closeout relied on strong existing production integration coverage rather than adding a redundant monolithic coup E2E test.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern="FITL coup"` passed (full engine suite passed in this run).
  - `pnpm -F @ludoforge/runner bootstrap:fixtures` passed.
  - `pnpm -F @ludoforge/runner bootstrap:fixtures:check` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
