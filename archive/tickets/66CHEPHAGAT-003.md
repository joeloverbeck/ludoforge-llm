# 66CHEPHAGAT-003: Add phase gating to FITL checkpoint data and integration tests

**Status**: COMPLETE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic CNL/GameSpecDoc victory lowering
**Deps**: `archive/tickets/66CHEPHAGAT-001.md`

## Problem

FITL's four `duringCoup` victory checkpoints currently fire on every phase transition within a Coup round. Per FITL rules (Section 6.1, 7.2), victory is checked once at the start of the Coup round (the `coupVictory` phase). The `finalCoup` checkpoint should only fire after `coupRedeploy` on the final round (rule 6.4.5). Without `phases` gating in the game data, simulations can terminate prematurely when threshold crossings occur during Resources, Support, or Redeploy.

## Assumption Reassessment (2026-04-11)

1. `data/games/fire-in-the-lake/90-terminal.md` contains 5 checkpoints: `us-victory`, `arvn-victory`, `nva-victory`, `vc-victory` (all `duringCoup`), and `final-coup-ranking` (`finalCoup`). None have a `phases` field. Confirmed.
2. The FITL turn structure includes coup phases `coupVictory`, `coupResources`, `coupSupport`, `coupRedeploy`, `coupCommitment`, `coupReset` (confirmed from existing test at `fitl-coup-victory-phase-gating.test.ts` using `asPhaseId('coupVictory')`, etc.).
3. Existing integration test file `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts` has 3 tests covering: victory halt at coupVictory, phase advancement when no victory, final-coup ranking after coupRedeploy. These tests should continue to pass after the data change.
4. The `phases` field and runtime gating will be available from 66CHEPHAGAT-001.

## Architecture Check

1. The FITL `phases` values remain pure spec data, but the compiler must preserve that generic field from GameSpecDoc into GameDef to satisfy Foundations 2, 12, 14, and 15.
2. The CNL/GameSpecDoc changes stay game-agnostic: they carry a generic optional `phases` array on victory checkpoints and validate its authored shape without introducing FITL-specific logic.
3. The `phases` values reference phase IDs already declared in the FITL turn structure — compiler/GameDef validation still catches typos.
4. Existing integration tests already set `currentPhase` to specific coup phases, so they naturally validate the gating behavior once the compiler path preserves the field.

## What to Change

### 1. Add `phases` to FITL checkpoints in `90-terminal.md`

In `data/games/fire-in-the-lake/90-terminal.md`:

- Add `phases: [coupVictory]` to each of the four `duringCoup` checkpoints (`us-victory`, `arvn-victory`, `nva-victory`, `vc-victory`).
- Add `phases: [coupRedeploy]` to the `final-coup-ranking` (`finalCoup`) checkpoint.

Example for `us-victory`:
```yaml
    - id: us-victory
      seat: 'us'
      timing: duringCoup
      phases: [coupVictory]
      when:
        ...
```

### 2. Verify existing integration tests still pass

The 3 existing tests in `fitl-coup-victory-phase-gating.test.ts` should pass unchanged:
- Test 1 sets `currentPhase: coupVictory` and expects victory — still fires because `coupVictory` is in `phases`.
- Test 2 sets `currentPhase: coupVictory` with no winner, advances to `coupResources` — checkpoint doesn't fire at `coupResources` (now explicitly gated, previously didn't fire because condition wasn't met).
- Test 3 sets `currentPhase: coupRedeploy` for final-coup — fires because `coupRedeploy` is in `phases`.

### 3. Additional integration tests

Add to `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts`:

1. **Mid-Coup threshold crossing does not end game** (spec test case 8/13): Set up a state at `coupSupport` or `coupResources` where a faction's victory condition is mathematically true. Assert `terminalResult()` returns `null` because the checkpoint is gated to `coupVictory`.

2. **Redeploy executes when no faction wins at victory check** (spec test case 11): Advance through a non-final Coup where nobody wins at `coupVictory`. Assert that Redeploy-phase actions appear in legal moves or the game trace after passing through Resources and Support.

3. **Final Coup plays through all phases before margin ranking** (spec test case 10): On the final Coup where nobody wins at the Victory check, assert the game plays through Resources, Support, Redeploy phases before the `finalCoup` checkpoint triggers at `coupRedeploy`.

## Files to Touch

- `data/games/fire-in-the-lake/90-terminal.md` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compile-victory.ts` (modify)
- `packages/engine/src/cnl/validate-spec-shared.ts` (modify)
- `packages/engine/src/cnl/validate-actions.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts` (modify)

## Out of Scope

- Engine type/schema changes (66CHEPHAGAT-001)
- Compiler validation (66CHEPHAGAT-002)
- Removing the redundant isCoup guard from checkpoint conditions (optional follow-up per spec)
- Determinism regression test (spec test case 14) — existing determinism tests in the suite cover this; adding a dedicated one is not justified by risk

## Acceptance Criteria

### Tests That Must Pass

1. Existing 3 integration tests pass unchanged after adding `phases` to game data
2. `terminalResult()` returns `null` at `coupSupport`/`coupResources` even when a faction's victory condition is true
3. Redeploy-phase actions are reachable when no faction wins at the Victory check
4. Full FITL compilation succeeds with the new `phases` fields
5. Full test suite passes

### Invariants

1. All `duringCoup` checkpoints have `phases: [coupVictory]` — no checkpoint evaluates outside the Victory phase
2. `final-coup-ranking` has `phases: [coupRedeploy]` — final ranking only at Redeploy
3. No FITL-specific engine logic is added; compiler changes remain generic spec plumbing only
4. FITL game compilation produces no new errors or warnings

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts` — 3 additional integration tests for mid-Coup gating, Redeploy reachability, and final-Coup phase progression

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-coup-victory-phase-gating.test.js`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Added `phases: [coupVictory]` to all four FITL `duringCoup` checkpoints and `phases: [coupRedeploy]` to `final-coup-ranking` in `data/games/fire-in-the-lake/90-terminal.md`.
- Fixed the generic CNL/GameSpecDoc victory pipeline so authored checkpoint `phases` survive from YAML into the compiled `GameDef`, and added authored-shape validation plus checkpoint unknown-key validation for that field.
- Expanded `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts` to prove:
  - the production FITL compile now carries checkpoint phase gates,
  - mid-Coup threshold crossings do not end the game outside `coupVictory`,
  - Redeploy remains reachable when no one wins at `coupVictory`,
  - final-Coup ranking is suppressed until `coupRedeploy`.

## Verification Run

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-coup-victory-phase-gating.test.js`
- `pnpm turbo test`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
