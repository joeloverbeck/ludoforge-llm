# FITLCOUROUANDDATFIX-002: Add Coup Phase Structure and Global Variables

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data-only YAML additions
**Deps**: FITLCOUROUANDDATFIX-001

## Problem

The FITL spec has only a single `main` phase in `turnStructure.phases`. The Coup Round (Rules Section 6.0-6.6) requires a 6-phase sequence after the main event card phase: Victory, Resources, Support, Redeploy, Commitment, Reset. The kernel's `advanceToDecisionPoint` auto-skips phases with zero legal moves, so adding these phases is safe — they will be invisible during non-coup turns.

Additionally, global variables are needed to track coup round state (`isCoupRound` flag, per-phase counters) and a trigger must detect coup card entry to activate/deactivate the sequence.

## Assumption Reassessment (2026-02-23)

1. `turnStructure.phases` currently contains only `- id: main` in `30-rules-actions.md:5-6`.
2. The kernel's `advanceToDecisionPoint` in `packages/engine/src/kernel/phase-advance.ts` auto-skips phases with no legal moves — confirmed by existing interrupt phase behavior.
3. `turnStructure.interrupts` already contains `- id: commitment` — the new coup phases go in `phases`, not `interrupts`.
4. Global variables are defined in `10-vocabulary.md` under `globalVars:` (lines 172-355).
5. Coup card tokens have an `isCoup` property that can be used for detection.

## Architecture Check

1. Adding phases to `turnStructure.phases` is the architecturally correct way to model the coup sequence — it leverages the kernel's existing phase-skipping behavior.
2. All new data is in `GameSpecDoc` YAML — no engine code changes needed, preserving the Agnostic Engine Rule.
3. No backwards-compatibility concerns — existing `main` phase behavior is unchanged; new phases are appended after it.

## What to Change

### 1. Extend turnStructure.phases in 30-rules-actions.md

Change:
```yaml
turnStructure:
  phases:
    - id: main
```

To:
```yaml
turnStructure:
  phases:
    - id: main
    - id: coupVictory
    - id: coupResources
    - id: coupSupport
    - id: coupRedeploy
    - id: coupCommitment
    - id: coupReset
```

### 2. Add coup global variables to 10-vocabulary.md

Append to `globalVars:`:
```yaml
  - name: isCoupRound
    type: boolean
    init: false
  - name: consecutiveCoupSkip
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

### 3. Add coup card entry trigger to 30-rules-actions.md

Add a trigger that fires when a coup card enters the `played` zone. It must:
1. Check if the previously played card was also a coup (consecutive coup guard per Rule 6.0 exception).
2. If consecutive: set `isCoupRound = false` and `consecutiveCoupSkip = true`.
3. If not consecutive: set `isCoupRound = true` and `consecutiveCoupSkip = false`.
4. Reset coup-phase counters to 0.

### 4. Add stub actions for coup phases

Add placeholder actions gated by `isCoupRound == true` and restricted to their respective phases, so `advanceToDecisionPoint` sees zero legal moves during non-coup turns and skips them. Actual effects are wired in subsequent tickets. Each phase needs at minimum:
- A `coupVictoryCheck` action on `coupVictory` phase (auto-resolved)
- A `coupResourcesProcess` action on `coupResources` phase (auto-resolved)
- A `coupPacifyPass` / `coupAgitatePass` action on `coupSupport` phase (pass-through)
- A `coupRedeployPass` action on `coupRedeploy` phase (pass-through)
- A `coupCommitmentPass` action on `coupCommitment` phase (pass-through, also gated by non-final coup)
- A `coupResetProcess` action on `coupReset` phase (auto-resolved)

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add phases, trigger, stub actions)
- `data/games/fire-in-the-lake/10-vocabulary.md` (modify — add global variables)

## Out of Scope

- Actual coup phase effects (Resources logic, Support choices, etc.) — those are tickets 003-008.
- Changes to `20-macros.md` (no macros needed yet).
- Changes to `40-content-data-assets.md` or `90-terminal.md`.
- Engine/kernel code changes.
- Runner bootstrap fixture regeneration (deferred to final integration ticket).

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compilation succeeds without errors for all 3 scenarios.
2. Compiled GameDef `turnStructure.phases` contains exactly 7 phase entries: `main`, `coupVictory`, `coupResources`, `coupSupport`, `coupRedeploy`, `coupCommitment`, `coupReset`.
3. Compiled GameDef `globalVars` includes `isCoupRound`, `consecutiveCoupSkip`, `coupSupportSpacesUsed`, `coupAgitationSpacesUsed`, `coupUsTroopsMoved`, `coupUsBasesMoved`.
4. Non-coup-card simulation: a normal event card turn proceeds through `main` phase and auto-skips all 6 coup phases (advanceToDecisionPoint behavior).
5. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass, zero regressions.
6. `pnpm turbo typecheck` — passes.

### Invariants

1. Existing `main` phase behavior is completely unchanged.
2. Non-coup turns are functionally identical to pre-change behavior (phases auto-skipped).
3. The `commitment` interrupt phase remains in `turnStructure.interrupts` — it is separate from `coupCommitment`.
4. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-phase-structure.test.ts` (new) — compile production spec, assert 7 phases present, assert new globalVars exist, verify non-coup turn auto-skips all coup phases.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-phase"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full engine suite)
3. `pnpm turbo typecheck`
