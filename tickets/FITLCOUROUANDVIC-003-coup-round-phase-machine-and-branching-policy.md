# FITLCOUROUANDVIC-003 - Coup Round Phase Machine and Branching Policy

**Status**: Planned  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-001`, `FITLCOUROUANDVIC-002`

## Goal
Implement deterministic Coup-round phase sequencing and branch policy (final-round skips and consecutive-Coup exception) via generic phase-machine execution contracts.

## Implementation Tasks
1. Add declarative Coup phase sequence execution in runtime turn/phase flow.
2. Implement final-Coup branching (skip commitment/reset when required by definition).
3. Enforce consecutive-Coup exception policy so more than one Coup round cannot occur in sequence.
4. Emit ordered, trace-visible phase/substep entries for every executed Coup step.

## File List Expected To Touch
- `src/kernel/phase-advance.ts`
- `src/kernel/turn-flow-lifecycle.ts`
- `src/kernel/legal-moves.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/phase-advance.test.ts`
- `test/unit/legal-moves.test.ts`
- `test/unit/game-loop.golden.test.ts`
- `test/integration/fitl-turn-flow-golden.test.ts`

## Out Of Scope
- Arithmetic details for resources/support/redeploy/commitment/reset effects.
- Victory threshold/margin formulas.
- Event framework or card-specific behaviors from Spec 20.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/phase-advance.test.js`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/game-loop.golden.test.js`
- `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Coup substep ordering is deterministic and trace-stable.
- Non-final/final branching is data-defined, not title-hardcoded.
- Existing non-Coup turn progression behavior remains unchanged.

