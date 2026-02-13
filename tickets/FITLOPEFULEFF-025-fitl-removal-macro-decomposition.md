# FITLOPEFULEFF-025: FITL Removal Macro Decomposition

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (4-6 hours)
**Spec reference**: Spec 26 (Assault/Attack behaviors), Spec 13a macro architecture
**Depends on**: FITLOPEFULEFF-023, FITLOPEFULEFF-024

## Summary

Refactor FITL removal YAML into explicit, small macros by responsibility:
- Base priority removal flow
- COIN Assault wrapper behavior
- Insurgent Attack wrapper behavior

Objective: improve readability, rule traceability, and maintainability after generic primitive introduction.

## Problem

Current FITL macro structure still mixes concerns:
- Targeting policy
- Budget mechanics
- Side effects (Aid, attrition, tunnel handling)

This makes future operation changes risky.

## Proposed Architecture

Define macros with single responsibilities:
1. `fitl-remove-insurgent-by-priority` (target policy + ordered groups)
2. `fitl-coin-assault-removal` (Aid, tunnel/base handling rules)
3. `fitl-insurgent-attack-removal` (US casualties + attacker attrition)

Use explicit params (`targetFactions`, `actorFaction`, `budgetExpr`) and avoid implicit behavior inference.

## Files to Touch

- `data/games/fire-in-the-lake.md` — macro decomposition and call-site updates in Assault/Attack profiles
- `test/integration/fitl-removal-ordering.test.ts` — assert behavior remains correct
- `test/integration/fitl-coin-operations.test.ts`
- `test/integration/fitl-insurgent-operations.test.ts`

## Out of Scope

- New operation mechanics beyond Spec 26
- Kernel changes (handled in FITLOPEFULEFF-024)

## Acceptance Criteria

### Tests That Must Pass
1. COIN Assault removal order remains correct and deterministic.
2. Insurgent Attack removal + attrition semantics remain correct.
3. Macro call sites no longer rely on ambiguous actor-vs-target inference.
4. Macro definitions are smaller, composable, and independently testable.

### Invariants
- All game-specific behavior remains in GameSpecDoc data
- No hidden coupling between COIN and insurgent removal wrappers
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)
