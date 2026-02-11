# FITLCOUROUANDVIC-004 - Coup Resources Phase Accounting and Bounds

**Status**: Planned  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-002`, `FITLCOUROUANDVIC-003`

## Goal
Implement Resources phase execution (rule 6.2 slice in Spec 19) with deterministic loops, coupled accounting effects, and strict bounds/floors.

## Implementation Tasks
1. Implement sabotage placement exhaustion loop with explicit deterministic target ordering.
2. Implement trail degradation condition from COIN Laos/Cambodia control.
3. Implement ARVN earnings (`Aid + unSabotaged LoC Econ`) and `Total Econ` updates.
4. Implement insurgent earnings formulas for VC and NVA.
5. Implement casualties-to-aid penalty (`Aid -= 3 * casualties`, floor `0`).

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/eval-query.ts`
- `src/kernel/eval-value.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/effects-zone-ops.test.ts`
- `test/unit/eval-query.test.ts`
- `test/unit/eval-value.test.ts`
- `test/integration/fitl-coup-resources-phase.test.ts` (new)

## Out Of Scope
- Support phase pacification/agitation budgets.
- Redeploy/commitment/reset phase execution.
- Final victory ranking/margin output.
- Any per-card event behavior.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/effects-zone-ops.test.js`
- `node --test dist/test/unit/eval-query.test.js`
- `node --test dist/test/unit/eval-value.test.js`
- `node --test dist/test/integration/fitl-coup-resources-phase.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Resource, aid, patronage, and econ bounds stay within declared limits.
- Resources phase loops terminate deterministically for the same state.
- No hidden runtime reads from `data/fitl/...` are introduced.

