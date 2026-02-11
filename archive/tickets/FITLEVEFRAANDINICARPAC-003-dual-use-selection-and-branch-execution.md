# FITLEVEFRAANDINICARPAC-003 - Dual-Use Selection and Branch Execution

**Status**: ✅ COMPLETED  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-002`

## Goal
Confirm and harden generic runtime semantics for dual-use event cards so either side can be selected regardless of acting faction, A-or-B branch choices resolve deterministically, and selections are trace-visible through existing move logs.

## Reassessed assumptions (2026-02-11)
- Core selection semantics already exist in generic kernel flow:
  - `legalMoves` enumerates action params from declared domains in deterministic order.
  - `applyMove` binds selected move params into effects.
  - `chooseOne` / `chooseN` runtime assertions already validate selected choices against declared domains.
- Dedicated runtime fields for event side/branch are not currently required to satisfy trace visibility because `MoveLog.move.params` already records the selected values in traces.
- The original file-touch list over-scoped schema/runtime files (`src/kernel/types.ts`, `src/kernel/schemas.ts`, `schemas/Trace.schema.json`) for this ticket’s actual gap.
- The remaining gap is missing targeted regression coverage proving these semantics explicitly for event-style side/branch selection.

## Scope
- Add/strengthen tests proving dual-use side selection is legal independent of active faction identity.
- Add/strengthen tests proving deterministic branch move ordering and branch-specific execution from selected params.
- Add/strengthen tests proving trace visibility of selected side/branch via `MoveLog.move.params`.

## Implementation tasks
1. Add legal-move coverage for dual-use side/branch param enumeration and active-faction independence.
2. Add apply-move coverage for selected side/branch effects resolution.
3. Add simulator trace coverage for side/branch selection visibility in move logs.

## File list it expects to touch
- `test/unit/legal-moves.test.ts`
- `test/unit/apply-move.test.ts`
- `test/unit/sim/simulator.test.ts`

## Out of scope
- New `GameDef`/schema fields dedicated to side or branch metadata.
- New trigger log entry kinds for event-side/branch selection.
- FITL-specific runtime branches keyed by card id/faction/map identifiers.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/sim/simulator.test.js`

### Invariants that must remain true
- Dual-use side selection remains generic and data-driven via action params.
- Branch legality and execution remain deterministic for identical state/input.
- Selection trace visibility is preserved through `MoveLog.move.params` with no FITL-specific runtime logic.

## Outcome
- Completion date: 2026-02-11.
- What changed:
  - Updated ticket assumptions/scope to match actual engine behavior and identify the real gap as regression coverage.
  - Added unit test coverage for deterministic dual-use side/branch move enumeration across active factions.
  - Added unit test coverage for side/branch-driven event resolution in `applyMove`.
  - Added simulator test coverage proving selected side/branch values are preserved in trace move logs.
- Deviations from original plan:
  - No runtime/schema API changes were needed; existing generic move-param and trace contracts already covered the required semantics.
  - `test/unit/validate-gamedef.test.ts` was not modified because no new schema/runtime contract was introduced.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/legal-moves.test.js` passed.
  - `node --test dist/test/unit/apply-move.test.js` passed.
  - `node --test dist/test/unit/sim/simulator.test.js` passed.
  - Additional validation run: `npm run test:unit -- --test-name-pattern "dual-use|event side|branch|simulator|legalMoves|applyMove"` passed.
