# FITLCOUROUANDVIC-006 - Coup Redeploy/Commitment/Reset Phase Effects

**Status**: Planned  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-002`, `FITLCOUROUANDVIC-003`

## Goal
Implement deterministic phase effects for Redeploy (6.4), Commitment (6.5, non-final only), and Reset (6.6, non-final only), including required control recomputation windows.

## Implementation Tasks
1. Implement forced Laos/Cambodia COIN removal behavior and ARVN/NVA redeploy constraints.
2. Recompute control at required redeploy/commitment checkpoints.
3. Implement casualty transitions and US commitment/withdrawal movement bounds.
4. Implement reset semantics: trail normalization edge rule, terror/sabotage clear, guerrilla/SF flips, momentum discard, eligibility reset, next-card advance.
5. Ensure final Coup skips commitment/reset when phase policy indicates.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/turn-flow-lifecycle.ts`
- `src/kernel/phase-advance.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/turn-flow-eligibility.test.ts` (new)
- `test/unit/phase-advance.test.ts`
- `test/integration/fitl-coup-redeploy-commit-reset.test.ts` (new)

## Out Of Scope
- Resources and Support phase arithmetic.
- Victory threshold checks and final ranking output.
- Event card framework behaviors.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/phase-advance.test.js`
- `node --test dist/test/unit/turn-flow-eligibility.test.js`
- `node --test dist/test/integration/fitl-coup-redeploy-commit-reset.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Control recompute checkpoints execute at deterministic declared windows.
- Non-final/final Coup skip rules are honored exactly.
- Reset phase leaves eligibility and lifecycle windows in a valid baseline state.

