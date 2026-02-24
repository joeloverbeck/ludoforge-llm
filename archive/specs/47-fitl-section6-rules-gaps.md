# Spec 47: FITL Section 6 Rules Gaps

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: S
**Dependencies**: Spec 26 (operations), Spec 27 (SAs), Spec 46 (Section 4 gaps)
**Estimated effort**: 1-2 days
**Source sections**: Rules Section 6 gap analysis (`reports/fire-in-the-lake-rules-section-6.md`)

## Overview

Gap analysis of FITL Rules Section 6 (Coup Rounds) against the current game data (`data/games/fire-in-the-lake/`) identified 3 confirmed gaps across the Resources Phase (6.2.1 Sabotage), the Support Phase (6.3.1 Pacification, 6.3.2 Agitation). The remainder of Section 6 is correctly implemented: victory phase (6.1), trail degradation (6.2.2), ARVN earnings (6.2.3), insurgent earnings (6.2.4), casualties/aid (6.2.5), redeploy (6.4), commitment (6.5), reset (6.6), and trail tracking (6.7).

All changes are **data-only YAML** in GameSpecDoc files under `data/games/fire-in-the-lake/`. No engine or kernel code changes.

## Gap Analysis Summary

| # | Gap | Rule | Status | Action |
|---|-----|------|--------|--------|
| 1 | Sabotage auto-applies without VC player choice when markers insufficient | 6.2.1 | Completed | FITLSEC6RULGAP-001 |
| 2 | Pacification allows shiftSupport even when Terror is present | 6.3.1 | Completed | FITLSEC6RULGAP-002 |
| 3 | Agitation allows shiftOpposition even when Terror is present | 6.3.2 | Completed | FITLSEC6RULGAP-003 |

## Verified Correct (No Changes Needed)

| Rule | Section | Status |
|------|---------|--------|
| 6.0 | Coup round sequencing | Correct — `maxConsecutiveRounds: 1` enforces no consecutive Coup Rounds |
| 6.1 | Victory Phase | Correct — terminal checkpoints with `timing: duringCoup` |
| 6.2.2 | Trail Degradation | Correct — `coup-trail-degradation` macro |
| 6.2.3 | ARVN Earnings | Correct — `coup-arvn-earnings` macro (Aid + unSabotaged Econ) |
| 6.2.4 | Insurgent Earnings | Correct — `coup-insurgent-earnings` macro (VC bases, NVA bases + 2x trail) |
| 6.2.5 | Casualties/Aid | Correct — `coup-casualties-aid` macro (Aid -= 3x casualties count) |
| 6.3.1 | Pacification removeTerror | Correct — removeTerror branch checks terror marker presence |
| 6.3.2 | Agitation removeTerror | Correct — removeTerror branch checks terror marker presence |
| 6.4.1 | Laos/Cambodia Removal | Correct — `coup-laos-cambodia-removal` macro |
| 6.4.2 | ARVN Mandatory/Optional Redeploy | Correct — 3 actions with proper preconditions |
| 6.4.3 | NVA Troop Redeploy | Correct — action allows any source, target must have NVA base |
| 6.4.4 | Control Adjustment | N/A — control is dynamically derived from piece counts |
| 6.5 | Commitment Phase | Correct — `coup-process-commitment` macro (casualties + 10 troops + 2 bases) |
| 6.6 | Reset Phase | Correct — `coup-reset-markers` macro (trail normalize, clear markers, flip underground, momentum reset) |
| 6.7 | Trail | Correct — tracks defined with min:0/max:4 |

## Scope

### In Scope

- Sabotage VC player choice when markers are insufficient (macro rewrite)
- Pacification terror prerequisite for shiftSupport (US and ARVN actions)
- Agitation terror prerequisite for shiftOpposition (VC action)

### Out of Scope

- Kernel source code changes (all DSL primitives already exist)
- Compiler source code changes
- Profiles already verified correct (trail degradation, earnings, casualties, redeploy, commitment, reset)
- removeTerror branches (already correct — they check for terror presence)

---

## FITLSEC6RULGAP-001: Sabotage VC Player Choice

**Priority**: P2
**Estimated effort**: Medium (2-3 hours)
**Rule reference**: 6.2.1
**Depends on**: None

### Summary

Rule 6.2.1: "Sabotage each unSabotaged LoC where Insurgent Guerrillas outnumber COIN pieces or adjacent to a City without COIN Control (until no Sabotage markers remain, **VC chooses which spaces first**)."

The parenthetical "VC chooses which spaces first" means that when there are more eligible LoCs than remaining Sabotage markers (cap of 15), the VC player selects which LoCs to sabotage. Currently, the `coup-auto-sabotage` macro (`20-macros.md` lines 2196-2266) uses `forEach` over `mapSpaces` with a marker-cap guard inside the loop — iteration order determines which LoCs get sabotaged, not VC player choice.

### Current Behavior

```yaml
# coup-auto-sabotage macro (20-macros.md lines 2196-2266)
- id: coup-auto-sabotage
  params: []
  exports: []
  effects:
    - forEach:
        bind: $loc
        over:
          query: mapSpaces
          filter:
            op: and
            args:
              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
              - { op: '!=', left: { ref: markerState, space: $zone, marker: sabotage }, right: sabotage }
              - op: or
                args:
                  - # ... insurgent guerrillas > COIN pieces check ...
                  - # ... adjacent city without COIN Control check ...
        effects:
          - if:
              when: { op: '<', left: { ref: gvar, var: terrorSabotageMarkersPlaced }, right: 15 }
              then:
                - setMarker: { space: $loc, marker: sabotage, state: sabotage }
                - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
```

The macro iterates all eligible LoCs and auto-sabotages each one as long as markers remain. When markers run out mid-iteration, remaining eligible LoCs are silently skipped. The VC player has no agency over which spaces are prioritized.

### Required Behavior

1. Collect all eligible LoCs (unSabotaged, meeting the insurgent/adjacent-city criteria)
2. Compute remaining Sabotage markers: `15 - terrorSabotageMarkersPlaced`
3. If eligible count <= remaining markers: auto-sabotage all (no choice needed)
4. If eligible count > remaining markers: present VC (seat 3) with a `chooseN` to select exactly `remaining` LoCs from the eligible set
5. Apply sabotage to chosen (or all) LoCs

### Implementation

Restructure the macro to first count eligible LoCs, then branch:

**Sketch**:

```yaml
- id: coup-auto-sabotage
  params: []
  exports: []
  effects:
    # Compute remaining markers
    - let:
        bind: $remaining
        value:
          op: '-'
          left: 15
          right: { ref: gvar, var: terrorSabotageMarkersPlaced }
    # When remaining > 0, proceed
    - if:
        when: { op: '>', left: { ref: binding, name: $remaining }, right: 0 }
        then:
          # Count eligible LoCs
          - let:
              bind: $eligibleCount
              value:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                        - { op: '!=', left: { ref: markerState, space: $zone, marker: sabotage }, right: sabotage }
                        - # ... same eligibility conditions as current ...
          - if:
              when: { op: '<=', left: { ref: binding, name: $eligibleCount }, right: { ref: binding, name: $remaining } }
              then:
                # Auto-sabotage all eligible — no choice needed
                - forEach:
                    bind: $loc
                    over:
                      query: mapSpaces
                      filter: # ... same eligibility filter ...
                    effects:
                      - setMarker: { space: $loc, marker: sabotage, state: sabotage }
                      - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
              else:
                # VC chooses which spaces to sabotage
                - chooseN:
                    player: 3
                    bind: $chosenLocs
                    options:
                      query: mapSpaces
                      filter: # ... same eligibility filter ...
                    min: { ref: binding, name: $remaining }
                    max: { ref: binding, name: $remaining }
                - forEach:
                    bind: $loc
                    over: { query: binding, name: $chosenLocs }
                    effects:
                      - setMarker: { space: $loc, marker: sabotage, state: sabotage }
                      - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
```

**Note**: The exact DSL syntax for `let`/`chooseN` within macros should follow existing patterns in the codebase. The eligibility filter (insurgent guerrillas outnumber COIN pieces OR adjacent to city without COIN Control) must be preserved exactly from the current implementation. The implementer should verify whether `chooseN` inside a macro expands correctly and whether the VC player (seat 3) can be specified as the chooser within a phaseEnter trigger context.

### Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` — Rewrite `coup-auto-sabotage` macro (lines ~2196-2266)

### Acceptance Criteria

1. When eligible LoCs <= remaining Sabotage markers, all eligible LoCs are auto-sabotaged (no choice prompt)
2. When eligible LoCs > remaining markers, VC player (seat 3) is presented with a choice of exactly `remaining` LoCs from the eligible set
3. The eligibility criteria (insurgent guerrillas > COIN pieces OR adjacent to uncontrolled city) are unchanged
4. The 15-marker cap is respected
5. No kernel source files modified
6. Build passes (`pnpm turbo build`)
7. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## FITLSEC6RULGAP-002: Pacification Terror Prerequisite

**Priority**: P1
**Estimated effort**: Small (30 min)
**Rule reference**: 6.3.1
**Depends on**: None

### Summary

Rule 6.3.1: "Every 3 ARVN Resources spent removes a Terror marker or—**once no Terror is in a space**—shifts the space 1 level toward Active Support..."

The "once no Terror is in a space" clause means `shiftSupport` should only be a legal action when the target space has no Terror marker. Currently, both `coupPacifyUS` (lines 138-286) and `coupPacifyARVN` (lines 287-434) in `30-rules-actions.md` allow `shiftSupport` without checking for terror absence — a player could choose `shiftSupport` even when Terror is present.

### Current Behavior — coupPacifyUS

```yaml
# coupPacifyUS, shiftSupport branch precondition (lines 246-272)
- op: and
  args:
    - { op: '==', left: { ref: binding, name: action }, right: shiftSupport }
    - op: '>'
      left:
        aggregate:
          op: count
          query:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeSupport }
      right: 0
    - op: '>'
      left:
        aggregate:
          op: count
          query:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                - { op: '!=', left: { ref: markerState, space: $zone, marker: coupSupportShiftCount }, right: two }
      right: 0
```

Checks: action == shiftSupport, space != activeSupport, shift count != two. **Missing**: terror == none check.

### Current Behavior — coupPacifyARVN

```yaml
# coupPacifyARVN, shiftSupport branch precondition (lines 394-420)
- op: and
  args:
    - { op: '==', left: { ref: binding, name: action }, right: shiftSupport }
    - op: '>'
      left:
        aggregate:
          op: count
          query:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeSupport }
      right: 0
    - op: '>'
      left:
        aggregate:
          op: count
          query:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                - { op: '!=', left: { ref: markerState, space: $zone, marker: coupSupportShiftCount }, right: two }
      right: 0
```

Same structure, same missing terror check.

### Required Behavior

Add a terror == none precondition to the `shiftSupport` branch in both actions. `shiftSupport` should only be legal when the target space has no Terror marker.

### Implementation

In both `coupPacifyUS` and `coupPacifyARVN`, add a new condition to the `shiftSupport` `op: and` args array:

```yaml
- op: '>'
  left:
    aggregate:
      op: count
      query:
        query: mapSpaces
        filter:
          op: and
          args:
            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
            - { op: '==', left: { ref: markerState, space: $zone, marker: terror }, right: none }
  right: 0
```

This follows the existing pattern of checking marker states via `mapSpaces` filter with zone ID matching. Add this as an additional arg in the `shiftSupport` `op: and` block, alongside the existing `!= activeSupport` and `!= two` checks.

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `coupPacifyUS` shiftSupport precondition (line ~246-272) and `coupPacifyARVN` shiftSupport precondition (line ~394-420)

### Acceptance Criteria

1. `coupPacifyUS` with `action: shiftSupport` is only legal when the target space has no Terror marker
2. `coupPacifyARVN` with `action: shiftSupport` is only legal when the target space has no Terror marker
3. `removeTerror` branches remain unchanged (already require Terror to be present)
4. Other preconditions (COIN Control, Police, Troops, resource check, shift count) are unchanged
5. No kernel source files modified
6. Build passes (`pnpm turbo build`)
7. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## FITLSEC6RULGAP-003: Agitation Terror Prerequisite

**Priority**: P1
**Estimated effort**: Small (30 min)
**Rule reference**: 6.3.2
**Depends on**: None

### Summary

Rule 6.3.2: "Every 1 VC Resource they spend removes a Terror marker or—**once no Terror is in a space**—shifts the space 1 level toward Active Opposition..."

Same "once no Terror" rule as Pacification. Currently, `coupAgitateVC` (lines 435-563 in `30-rules-actions.md`) allows `shiftOpposition` without checking for terror absence.

### Current Behavior

```yaml
# coupAgitateVC, shiftOpposition branch precondition (lines 526-551)
- op: and
  args:
    - { op: '==', left: { ref: binding, name: action }, right: shiftOpposition }
    - op: '>'
      left:
        aggregate:
          op: count
          query:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeOpposition }
      right: 0
    - op: '>'
      left:
        aggregate:
          op: count
          query:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                - { op: '!=', left: { ref: markerState, space: $zone, marker: coupSupportShiftCount }, right: two }
      right: 0
```

Checks: action == shiftOpposition, space != activeOpposition, shift count != two. **Missing**: terror == none check.

### Required Behavior

Add a terror == none precondition to the `shiftOpposition` branch, identical pattern to FITLSEC6RULGAP-002.

### Implementation

Add the same terror check to the `shiftOpposition` `op: and` args array:

```yaml
- op: '>'
  left:
    aggregate:
      op: count
      query:
        query: mapSpaces
        filter:
          op: and
          args:
            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
            - { op: '==', left: { ref: markerState, space: $zone, marker: terror }, right: none }
  right: 0
```

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `coupAgitateVC` shiftOpposition precondition (line ~526-551)

### Acceptance Criteria

1. `coupAgitateVC` with `action: shiftOpposition` is only legal when the target space has no Terror marker
2. `removeTerror` branch remains unchanged (already requires Terror to be present)
3. Other preconditions (VC pieces, no COIN Control, resource check, shift count) are unchanged
4. No kernel source files modified
5. Build passes (`pnpm turbo build`)
6. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## Overall Test Plan

### Compilation Tests

All existing FITL compilation tests must continue to pass after YAML changes:
- `pnpm turbo build` — full build
- `pnpm -F @ludoforge/engine test` — full engine test suite
- `pnpm -F @ludoforge/engine test:e2e` — E2E pipeline tests

### Manual Verification

1. **FITLSEC6RULGAP-001**: Compile the FITL spec and verify that the `coup-auto-sabotage` macro presents VC with a choice when eligible LoCs exceed remaining Sabotage markers.
2. **FITLSEC6RULGAP-002**: Verify that `coupPacifyUS` and `coupPacifyARVN` with `action: shiftSupport` require `terror == none` in the target space.
3. **FITLSEC6RULGAP-003**: Verify that `coupAgitateVC` with `action: shiftOpposition` requires `terror == none` in the target space.

### Regression

- Texas Hold'em compilation tests must still pass (engine-agnosticism check)
- No new kernel or compiler source files created or modified
- Existing FITL E2E tests pass unchanged

## Outcome

- Completion date: 2026-02-24
- What was changed:
  - `FITLSEC6RULGAP-001` implemented the Section 6.2.1 sabotage choice behavior in FITL game data macros.
  - `FITLSEC6RULGAP-002` added terror prerequisites for pacification `shiftSupport` in US/ARVN coup support actions.
  - `FITLSEC6RULGAP-003` added terror prerequisites for VC agitation `shiftOpposition` in coup support actions.
- Deviations from original plan:
  - Some predicate examples in this spec used inline `mapSpaces`/`markerState` expressions, while final implementations aligned to existing production predicate macros where appropriate.
- Verification results:
  - `pnpm turbo build` passed during ticket execution.
  - `pnpm turbo lint` passed during ticket execution.
  - `pnpm -F @ludoforge/engine test` passed during ticket execution.
  - `pnpm -F @ludoforge/engine test:e2e` remains failing due to pre-existing unrelated Texas Hold'em e2e failures.
