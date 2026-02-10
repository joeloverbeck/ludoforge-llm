# GAMSPEPARVAL-009 - End-to-End, Property, and Golden Coverage
**Status**: ✅ COMPLETED

## Goal
Add comprehensive integration/property/golden coverage for the complete `parseGameSpec` + `validateGameSpec` flow.

## Reassessed Assumptions (2026-02-10)
- There is currently no `spec:lint` command or CLI implementation in this repository (`src/cli/index.ts` is a stub).
- `parseGameSpec` and `validateGameSpec` are already implemented in `src/cnl/`.
- `test/unit/source-map.test.ts` does not exist; source-map behavior is currently covered in `test/unit/parser.test.ts`.
- Existing unit tests already cover many parser/validator invariants, so this ticket should fill remaining gaps with end-to-end, property-style determinism/totality, and fixture-backed golden coverage.

## Scope
- Integration tests for realistic full markdown spec (clean case and multi-issue case) exercising parse + validate together.
- Property-style tests for parser/validator totality and deterministic behavior.
- Golden tests for:
  - valid markdown -> expected `GameSpecDoc` + source map anchors
  - invalid markdown -> expected diagnostics payload
- Ensure combined parse+validate diagnostic ordering is stable across repeated runs for identical input.

## File List (Expected to Touch)
- `test/integration/parse-validate-full-spec.test.ts` (new)
- `test/unit/property/parser-validator.property.test.ts` (new)
- `test/unit/parser-validator.golden.test.ts` (new)
- `test/fixtures/cnl/` (new golden fixtures)
- `tickets/GAMSPEPARVAL-009-end-to-end-and-golden-test-suite.md` (this reassessment)

## Out of Scope
- Functional parser or validator rule additions (except minimal fixes required to make tests pass).
- CLI UX redesign.
- Any schema or kernel runtime changes.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `npm run test:unit`
- `npm run test:integration`
- `npm test`
- Golden assertions must verify `code`, `path`, `severity`, `message`, plus optional `suggestion` and `alternatives` shape when present.

### Invariants that must remain true
- Parser and validator are deterministic for identical inputs.
- Every emitted diagnostic has non-empty `path` and `message`.
- Combined parse+validate diagnostic ordering remains stable and reproducible.
- Tests do not weaken validation expectations to match bugs.

## Outcome
- Completion date: 2026-02-10
- What was changed:
  - Reassessed and corrected ticket assumptions (removed `spec:lint` dependency, replaced non-existent `test/unit/source-map.test.ts` target).
  - Added end-to-end integration coverage for full valid and full multi-issue markdown specs.
  - Added parser/validator property-style tests for totality, determinism, and diagnostic-shape invariants.
  - Added fixture-backed golden coverage for valid doc/source-map anchors and invalid combined diagnostics.
- Deviations from original plan:
  - Scope now targets combined `parseGameSpec` + `validateGameSpec` behavior directly instead of non-existent CLI `spec:lint`.
  - No parser/validator production code changes were required; gaps were in tests and ticket assumptions.
- Verification results:
  - `npm run build` passed.
  - `npm run test:unit` passed.
  - `npm run test:integration` passed.
  - `npm test` passed.
