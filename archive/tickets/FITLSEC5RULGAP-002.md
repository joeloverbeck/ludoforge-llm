# FITLSEC5RULGAP-002: FITL Tests — Momentum + Free Operation Verification

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: None (FITLSEC5RULGAP-001 already completed and archived)

## Problem

Rule 5.1.2 states that the currently played event takes precedence over prior momentum effects. FITLSEC5RULGAP-001 is complete, but this ticket still needs to close integration coverage gaps for additional momentum-blocked actions under free-operation grants.

## Assumption Reassessment (2026-02-24)

1. FITL production spec compiles via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` — **confirmed** by existing FITL integration tests.
2. Momentum variables (`mom_typhoonKate`, `mom_rollingThunder`, `mom_claymores`, `mom_mcnamaraLine`, etc.) are boolean globals initialized to `false` — **confirmed** by FITL production tests and data.
3. Free operation grants are stored in `state.turnOrderState.runtime.pendingFreeOperationGrants` when turn order is card-driven — **corrected**.
4. Legal moves are enumerated via `legalMoves(def, state)` — **confirmed** as the standard API.
5. Relevant momentum-blocked operation IDs for this free-grant mechanism are `airLift`, `airStrike`, `transport`, and `assault` — **confirmed**.
6. Existing coverage already includes: (a) legality-predicate guard shape checks, and (b) Typhoon blocks paid Air Lift while a matching free grant allows Air Lift — **confirmed** in `fitl-momentum-prohibitions.test.ts`.
7. Remaining gap is scenario breadth, not architecture: free-grant override behavior is not yet covered for Air Strike, Transport, and US Assault under their momentum blockers.
8. Direct `ambushNva`/`ambushVc` and `infiltrate` free-grant scenarios are out of scope for this ticket because they are not directly represented as standalone free-operation grants in the tested turn-flow path; their momentum prohibition behavior itself remains covered in existing tests.

## Architecture Check

1. Current architecture is data-first and engine-agnostic: Rule 5.1.2 override is encoded in FITL legality predicates (`__freeOperation` guards), not via FITL-specific kernel branches.
2. Extending existing FITL integration tests is more robust than creating a parallel test file: it keeps momentum-rule assertions in one place and reduces duplication.
3. No backwards-compatibility shims or aliases; no kernel changes are needed for this ticket.

## What to Change

### 1. Extend existing momentum integration coverage

Update `packages/engine/test/integration/fitl-momentum-prohibitions.test.ts` to add the following scenarios:

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

**Scenario 3: Typhoon Kate + Free Transport**
- Set `mom_typhoonKate = true` (normally blocks Transport)
- Add pending free operation grant with `transport`
- Assert Transport appears with `freeOperation: true`

**Scenario 4: General Lansdale + Free US Assault**
- Set `mom_generalLansdale = true` (normally blocks US Assault)
- Add pending free operation grant with `assault`
- Assert Assault appears with `freeOperation: true`

**Scenario 5: Negative test — momentum blocks non-free operations**
- Set `mom_typhoonKate = true`
- Do NOT add any free operation grant
- Call `legalMoves(def, state)` and assert Air Lift does NOT appear
- Verifies the pipeline `legality:` blocks still work for normal (non-free) operations

## Files to Touch

- `packages/engine/test/integration/fitl-momentum-prohibitions.test.ts` (modify)

## Out of Scope

- Kernel source code changes
- FITL game data YAML changes
- Unit tests for speculative kernel fallback behavior (not part of implemented architecture)
- Tests for space-limit momentum effects (Typhoon Kate reducing SA spaces) — those work correctly already

## Acceptance Criteria

### Tests That Must Pass

1. Typhoon + grant: Air Lift appears as free legal move while paid Air Lift remains blocked
2. Rolling Thunder + grant: Air Strike appears as free legal move
3. Typhoon + grant: Transport appears as free legal move
4. General Lansdale + grant: US Assault appears as free legal move
5. Existing suite: `pnpm -F @ludoforge/engine test`
6. Full build: `pnpm turbo build`
7. Typecheck: `pnpm turbo typecheck`

### Invariants

1. No kernel source files created or modified
2. No FITL game data files modified
3. All tests use `compileProductionSpec()` (not synthetic fixtures)
4. Texas Hold'em tests still pass (engine-agnosticism)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-momentum-prohibitions.test.ts` — add Rule 5.1.2 scenario coverage for Air Strike, Transport, and US Assault under active momentum

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-02-24
- **What changed vs originally planned**:
  - Corrected ticket assumptions and scope before implementation to align with the current architecture from `FITLSEC5RULGAP-001`.
  - Implemented the additional Rule 5.1.2 integration coverage by extending existing `fitl-momentum-prohibitions.test.ts` instead of creating a new file.
  - Added free-grant override coverage for momentum-blocked operations that are directly grantable/executable in this path: `airStrike`, `transport`, and `assault` (with existing `airLift` + negative coverage retained).
- **Deviations from the original plan**:
  - Did not add separate direct free-grant scenarios for `ambushNva`/`ambushVc` or `infiltrate`; those are not represented as standalone free-operation grants in this tested turn-flow path.
  - Reused and strengthened the existing integration test file to avoid duplication and keep momentum-rule assertions centralized.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
