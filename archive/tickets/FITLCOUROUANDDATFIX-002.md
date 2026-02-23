# FITLCOUROUANDDATFIX-002: Production Coup Phase Skeleton + Executable CoupPlan Phase Routing

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel phase advancement now executes `turnOrder.config.coupPlan`
**Deps**: `archive/tickets/FITLCOUROUANDDATFIX-001.md` (completed)

## Problem

Production FITL required explicit Coup Round phase boundaries (Rules 6.0-6.6), but prior behavior depended on ad-hoc assumptions about when those phases should run.

The previous ticket draft assumed data-only wiring (`isCoupRound` globals + turn triggers) would be sufficient. Reassessment showed that this introduces game-specific state orchestration into production YAML and duplicates logic the engine can own generically.

## Assumption Reassessment (2026-02-23)

1. `data/games/fire-in-the-lake/30-rules-actions.md` needed explicit coup phases in `turnStructure.phases`.
2. `turnStructure.interrupts.commitment` already existed and had to remain unchanged.
3. `turnOrder.config.coupPlan` was already represented in schema/types, but runtime phase advancement did not execute it.
4. Rule-6.0 consecutive-coup handling was already tracked in card-driven runtime (`consecutiveCoupRounds`), so introducing FITL-only `prevPlayedWasCoup` globals was unnecessary.
5. A cleaner architecture is to keep game-specific definition in `GameSpecDoc` (`coupPlan` and phase IDs) while making phase activation generic in engine runtime.

## Architecture Decision

1. Implement engine-level effective phase resolution from `cardDriven.coupPlan` instead of FITL-only trigger flags.
2. Require exact phase-id parity: every `coupPlan.phases[*].id` must exist in `turnStructure.phases`.
3. Keep production FITL data declarative (phase list + `coupPlan` plan), with no aliasing and no backwards compatibility shims.

Why this is better:
- Centralizes coup-round activation/final-round omission in one generic kernel path.
- Removes FITL-specific runtime flags and trigger choreography.
- Scales to future card-driven games using the same `coupPlan` contract.

## Implemented Scope

### 1. Production FITL phase structure + coupPlan contract

Updated `data/games/fire-in-the-lake/30-rules-actions.md`:
- Added phases: `coupVictory`, `coupResources`, `coupSupport`, `coupRedeploy`, `coupCommitment`, `coupReset`.
- Added `turnOrder.config.coupPlan` with:
  - phase mapping for the six coup phases,
  - `finalRoundOmitPhases: [coupCommitment, coupReset]`,
  - `maxConsecutiveRounds: 1`.
- Added phase-scoped coup skeleton actions with deterministic `limits`.

### 2. Generic kernel phase routing for coup rounds

Updated `packages/engine/src/kernel/phase-advance.ts`:
- Added effective phase computation for card-driven turns using current played card, lookahead/deck state, and `consecutiveCoupRounds`.
- Non-coup (or suppressed consecutive coup) turns filter coup phases out.
- Eligible coup turns include coup phases.
- Final coup rounds omit configured `finalRoundOmitPhases`.
- `advancePhase` and `advanceToDecisionPoint` now use effective turn phases.

### 3. Validation hardening

Updated `packages/engine/src/kernel/validate-gamedef-extensions.ts`:
- Added `COUP_PLAN_PHASE_NOT_IN_TURN_STRUCTURE` diagnostic.
- Enforces strict no-aliasing alignment between `coupPlan.phases` and `turnStructure.phases`.

### 4. Test and fixture alignment

Adjusted unit/integration fixtures/tests to match strict coupPlan-phase contracts and executable coup routing.

## Files Touched

- `data/games/fire-in-the-lake/30-rules-actions.md`
- `packages/engine/src/kernel/phase-advance.ts`
- `packages/engine/src/kernel/validate-gamedef-extensions.ts`
- `packages/engine/test/integration/fitl-coup-phase-structure.test.ts` (new)
- `packages/engine/test/integration/fitl-card-lifecycle.test.ts`
- `packages/engine/test/integration/fitl-commitment-phase.test.ts`
- `packages/engine/test/unit/phase-advance.test.ts`
- `packages/engine/test/unit/compile-top-level.test.ts`
- `packages/engine/test/unit/validate-gamedef.test.ts`
- `packages/engine/test/fixtures/cnl/compiler/fitl-foundation-coup-victory-inline-assets.md`

## Acceptance Criteria (Final)

1. Production FITL compiles with coup phases declared in `turnStructure.phases`.
2. Coup phases are entered only on eligible coup turns via generic kernel logic.
3. Consecutive coup suppression is enforced via `maxConsecutiveRounds` and runtime counter.
4. Final coup omission honors `finalRoundOmitPhases`.
5. `validateGameDef` errors when `coupPlan` phase IDs do not exist in `turnStructure.phases`.
6. `pnpm -F @ludoforge/engine test` passes.
7. `pnpm turbo typecheck` passes.
8. `pnpm turbo lint` passes.

## Outcome

- Completion date: 2026-02-23
- What actually changed vs original plan:
  - Shifted from data-only FITL trigger flags to engine-level executable `coupPlan` phase routing.
  - Removed need for FITL-specific coup activation globals/alias paths.
  - Added strict validation that `coupPlan` phases must be declared in `turnStructure`.
  - Added production integration coverage for effective coup phase progression, consecutive suppression, and final-round omission.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed (`258/258`).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
