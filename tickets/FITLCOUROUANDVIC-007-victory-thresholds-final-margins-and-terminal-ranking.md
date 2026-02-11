# FITLCOUROUANDVIC-007 - Victory Thresholds, Final Margins, and Terminal Ranking

**Status**: Planned  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-001`, `FITLCOUROUANDVIC-002`, `FITLCOUROUANDVIC-003`, `FITLCOUROUANDVIC-006`

## Goal
Implement interim threshold checks during Coup and final-Coup winner ranking with deterministic margins/tie-break metadata emitted in terminal results.

## Implementation Tasks
1. Add declarative threshold evaluation hooks for Coup victory checks.
2. Add final-Coup margin formula evaluation in terminal resolution.
3. Emit deterministic ranking/tie-break metadata for all factions.
4. Ensure final Coup ends simulation immediately after required computation.
5. Add regression coverage for threshold wins and final margin ordering.

## File List Expected To Touch
- `src/kernel/terminal.ts`
- `src/kernel/phase-advance.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/index.ts`
- `test/unit/terminal.test.ts`
- `test/unit/game-loop-api-shape.test.ts`
- `test/integration/fitl-coup-victory.test.ts` (new)
- `test/integration/fitl-turn-flow-golden.test.ts`

## Out Of Scope
- Coup phase internal effect arithmetic already covered by prior tickets.
- Event framework/card behavior from Spec 20.
- Optional deception marker/handicap rules.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/terminal.test.js`
- `node --test dist/test/unit/game-loop-api-shape.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`
- `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Interim victory thresholds use data-defined values (`US>50`, `NVA>18`, `ARVN>50`, `VC>35`) from compiled definitions.
- Final margins are recomputed from canonical state, not cached incrementals.
- Terminal ranking output is deterministic for equal inputs.
