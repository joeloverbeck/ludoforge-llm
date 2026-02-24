# FITLSEC5RULGAP-002: FITL Tests — Momentum + Free Operation Verification

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: FITLSEC5RULGAP-001

## Problem

Rule 5.1.2 states that the currently played event takes precedence over prior momentum effects. After FITLSEC5RULGAP-001 implements the engine fix, FITL-specific integration tests are needed to verify the behavior end-to-end with real FITL game data: compile the production spec, set up game states with active momentum, grant free operations via events, and confirm the correct legal moves appear.

## Assumption Reassessment (2026-02-24)

1. FITL production spec compiles via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` — **confirmed** by existing FITL integration tests.
2. Momentum variables (`mom_typhoonKate`, `mom_rollingThunder`, `mom_claymores`, `mom_mcnamaraLine`, etc.) are boolean globals initialized to `false` — **confirmed** in `10-vocabulary.md`.
3. Free operation grants are stored in `state.extensions.cardDrivenRuntime.pendingFreeOperationGrants` — **confirmed** by examining `legal-moves-turn-order.ts` and `turn-flow-eligibility.ts`.
4. Legal moves are enumerated via `legalMoves(def, state)` — **confirmed** as the standard API.
5. Air Lift, Air Strike, Ambush, and Infiltrate action IDs exist in the compiled GameDef — **confirmed** via the action profiles in `30-rules-actions.md`.
6. Negative test: without a free operation grant, momentum correctly blocks the operation — **confirmed** as the current behavior (no changes to non-free enumeration).

## Architecture Check

1. Tests use the production spec compiler, not synthetic fixtures, ensuring they validate real FITL data correctness.
2. Tests are integration-level: compile spec → set up state → enumerate legal moves → assert. No kernel source changes.
3. No backwards-compatibility shims. Tests are additive — existing test files are untouched.

## What to Change

### 1. New integration test file for Rule 5.1.2 scenarios

Create `packages/engine/test/integration/fitl-rule-5-1-2-free-ops-momentum.test.ts` with the following test scenarios:

**Scenario 1: MACV + Typhoon Kate**
- Compile FITL production spec
- Set up game state in SA/operation selection phase for US player
- Set `mom_typhoonKate = true` (normally blocks Air Lift)
- Add a pending free operation grant for US with Air Lift action IDs
- Call `legalMoves(def, state)` and assert Air Lift appears with `freeOperation: true`

**Scenario 2: Gulf of Tonkin + Rolling Thunder**
- Same setup pattern
- Set `mom_rollingThunder = true` (normally blocks Air Strike)
- Add pending free operation grant for US with Air Strike action IDs
- Assert Air Strike appears with `freeOperation: true`

**Scenario 3: Free Ambush + Claymores**
- Set `mom_claymores = true` (normally blocks NVA/VC Ambush)
- Add pending free operation grant with Ambush action IDs
- Assert Ambush appears with `freeOperation: true`

**Scenario 4: Free Infiltrate + McNamara Line**
- Set `mom_mcnamaraLine = true` (normally blocks Infiltrate)
- Add pending free operation grant with Infiltrate action IDs
- Assert Infiltrate appears with `freeOperation: true`

**Scenario 5: Negative test — momentum blocks non-free operations**
- Set `mom_typhoonKate = true`
- Do NOT add any free operation grant
- Call `legalMoves(def, state)` and assert Air Lift does NOT appear
- Verifies the pipeline `legality:` blocks still work for normal (non-free) operations

## Files to Touch

- `packages/engine/test/integration/fitl-rule-5-1-2-free-ops-momentum.test.ts` (new)

## Out of Scope

- Kernel source code changes (covered by FITLSEC5RULGAP-001)
- FITL game data YAML changes
- Unit tests for the engine fallback path (covered by FITLSEC5RULGAP-001's test plan)
- Tests for space-limit momentum effects (Typhoon Kate reducing SA spaces) — those work correctly already

## Acceptance Criteria

### Tests That Must Pass

1. MACV + Typhoon Kate: Air Lift appears as free legal move despite active momentum block
2. Gulf of Tonkin + Rolling Thunder: Air Strike appears as free legal move
3. Free Ambush + Claymores: Ambush appears as free legal move
4. Free Infiltrate + McNamara Line: Infiltrate appears as free legal move
5. Negative: non-free Air Lift correctly blocked by Typhoon Kate
6. Existing suite: `pnpm -F @ludoforge/engine test`
7. Full build: `pnpm turbo build`

### Invariants

1. No kernel source files created or modified
2. No FITL game data files modified
3. All tests use `compileProductionSpec()` (not synthetic fixtures)
4. Texas Hold'em tests still pass (engine-agnosticism)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-rule-5-1-2-free-ops-momentum.test.ts` — 5 scenarios covering Rule 5.1.2 free operation override + negative test

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
