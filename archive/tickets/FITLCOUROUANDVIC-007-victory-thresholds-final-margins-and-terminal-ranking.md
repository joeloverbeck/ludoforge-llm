# FITLCOUROUANDVIC-007 - Victory Thresholds, Final Margins, and Terminal Ranking

**Status**: ✅ COMPLETED  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-001`, `FITLCOUROUANDVIC-002`, `FITLCOUROUANDVIC-003`, `FITLCOUROUANDVIC-006`

## Goal
Implement interim threshold checks during Coup and final-Coup winner ranking with deterministic margins/tie-break metadata emitted in terminal results.

## Assumption Reassessment (2026-02-11)
- `coupPlan`/`victory` schema and compiler pass-through already exist and are validated (`compile-top-level`, `validate-gamedef`, parser/schema tests).
- Coup handoff/consecutive-round lifecycle behavior is already covered (`test/unit/phase-advance.test.ts`, `test/integration/fitl-card-lifecycle.test.ts`).
- The missing runtime piece is terminal evaluation of `def.victory` (checkpoints + final margin ranking metadata); current `terminalResult` only evaluates `endConditions`.
- `test/integration/fitl-coup-victory.test.ts` does not exist yet and must be added by this ticket.
- Scope should avoid broad kernel refactors; implement the minimal terminal/runtime path plus focused tests.

## Implementation Tasks
1. Evaluate `def.victory.checkpoints` in terminal resolution for interim Coup threshold wins.
2. Evaluate `def.victory.margins` and deterministic ordering/tie-break metadata for final-Coup terminal ranking.
3. Preserve existing `endConditions` behavior as fallback when `victory` conditions do not terminate.
4. Verify `advanceToDecisionPoint`/simulation stops on newly terminal states without extra phase advancement.
5. Add/extend focused unit + integration regression coverage for threshold wins and final margin ordering.

## File List Expected To Touch
- `src/kernel/terminal.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/terminal.test.ts`
- `test/integration/fitl-coup-victory.test.ts` (new)
- `test/unit/game-loop-api-shape.test.ts` (only if API shape updates are required)

## Out Of Scope
- Coup phase internal effect arithmetic already covered by prior tickets.
- Event framework/card behavior from Spec 20.
- Optional deception marker/handicap rules.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/terminal.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`
- `node --test dist/test/unit/phase-advance.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Interim victory thresholds use data-defined values (`US>50`, `NVA>18`, `ARVN>50`, `VC>35`) from compiled definitions.
- Final margins are recomputed from canonical state, not cached incrementals.
- Terminal ranking output is deterministic for equal inputs.

## Outcome
- Completion date: 2026-02-11
- Actually changed:
  - Implemented runtime evaluation of `def.victory` in `terminalResult`, including interim checkpoint wins and final-coup margin ranking.
  - Added deterministic tie-break metadata (`tieBreakKey`) and ordered ranking payload in terminal victory metadata.
  - Added regression coverage in `test/unit/terminal.test.ts` and created `test/integration/fitl-coup-victory.test.ts`.
  - Kept legacy `endConditions` terminal path intact as fallback.
- Deviations from original plan:
  - `src/kernel/phase-advance.ts` and `src/kernel/index.ts` did not require changes after reassessment.
  - Added a non-breaking optional `victory` metadata field to terminal `win` results in `types`/`schemas` to avoid replacing existing terminal result variants.
- Verification results:
  - `npm run build`
  - `node --test dist/test/unit/terminal.test.js`
  - `node --test dist/test/integration/fitl-coup-victory.test.js`
  - `node --test dist/test/unit/phase-advance.test.js`
  - `node --test dist/test/integration/fitl-card-lifecycle.test.js`
  - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
  - `node --test dist/test/unit/game-loop-api-shape.test.js`
  - `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
