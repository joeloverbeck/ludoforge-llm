# FITLCOUROUANDVIC-005 - Coup Support Phase Budgeted Shifts

**Status**: Planned  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-002`, `FITLCOUROUANDVIC-003`

## Goal
Implement Support phase behavior with deterministic shared budgets and per-space shift caps for US/ARVN Pacification and VC Agitation.

## Implementation Tasks
1. Implement US then ARVN Pacification order with one shared max-4-space budget.
2. Enforce per-space max-2-shift cap.
3. Enforce US spending restriction so ARVN resources never drop below `Total Econ`.
4. Implement VC Agitation with max-4-space budget and per-space shift cap.
5. Record trace metadata sufficient to audit shift budgets/spends.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/eval-query.ts`
- `src/kernel/eval-value.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/effects-choice.test.ts`
- `test/unit/effects-var.test.ts`
- `test/integration/fitl-coup-support-phase.test.ts` (new)

## Out Of Scope
- Resources phase earnings and aid/casualty coupling.
- Redeploy/commitment/reset behavior.
- Victory threshold or final margin ranking logic.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/effects-choice.test.js`
- `node --test dist/test/unit/effects-var.test.js`
- `node --test dist/test/integration/fitl-coup-support-phase.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Shared/support-phase budgets are deterministic and cannot overspend.
- Per-space shift cap (`<=2`) is always enforced.
- ARVN resources never cross below `Total Econ` due to Support-phase spending.

