# FITLOPEANDSPEACT-009 - Spec 18 Integration, Determinism, and No-Hardcoded-FITL Audit

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001` through `FITLOPEANDSPEACT-008`

## Goal
Close Spec 18 with full integration coverage across operation + special-activity sequencing, free/limited-operation interactions, deterministic trace regression, and explicit no-hardcoded-FITL audit checks.

## Scope
- Add end-to-end integration scenarios exercising all 16 operation/special-activity families across card-flow windows.
- Add determinism regression fixtures for operation-heavy sequences.
- Add audit tests/grep assertions preventing FITL-id branching in shared compiler/kernel paths.
- Verify illegal attempts produce deterministic diagnostics with faction/rule reasons.

## File list it expects to touch
- `test/integration/fitl-operations-special-activities-e2e.test.ts` (new)
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/integration/determinism-full.test.ts`
- `test/fixtures/trace/fitl-operations-special-activities.golden.json` (new)
- `test/unit/validate-gamedef.golden.test.ts` (if new diagnostics snapshots are required)
- `specs/18-fitl-operations-and-special-activities.md` (status/links only if implementation completes)

## Out of scope
- New gameplay capabilities beyond Spec 18 contract.
- Spec 19 coup-round or victory-rule implementation.
- Spec 20 event-card framework changes.
- Broad refactors unrelated to operation/special-activity execution.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `npm run test:unit -- --coverage=false`
- `node --test dist/test/integration/fitl-operations-special-activities-e2e.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
- `node --test dist/test/integration/determinism-full.test.js`
- `npm test`

## Invariants that must remain true
- Same seed + same choices yields byte-identical trace output.
- All operations/special activities execute only via `GameSpecDoc -> GameDef -> simulation`.
- Shared compiler/kernel modules contain no FITL-specific branching by id/name.
- Non-FITL fixtures continue compiling and running unchanged.
