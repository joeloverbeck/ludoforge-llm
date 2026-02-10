# KERCONVALQUEEVA-008 - Integration, Property, and Golden Evaluation Tests

**Status**: ✅ COMPLETED

## Goal
Add high-confidence evaluation-layer tests that lock end-to-end behavior and invariants beyond the current unit suite.

## Assumption Reassessment (2026-02-10)
- `src/kernel` evaluation runtime already exists (`eval-condition`, `eval-value`, `eval-query`, `resolve-ref`, `resolve-selectors`) and is already covered by unit tests.
- Existing unit coverage already validates most Spec 04 operator semantics and many invariants.
- Missing from baseline: dedicated integration scenario test, dedicated evaluation property-style suite, and dedicated evaluation golden assertions/fixtures.

## Updated Scope
- Add one realistic integration scenario validating combined selector/reference/query/value/condition evaluation.
- Add deterministic property-style tests for key evaluator invariants.
- Add golden fixtures/assertions for stable complex condition and aggregate outputs.
- Keep changes additive and minimal: no evaluator API changes unless required to satisfy a failing acceptance criterion.

## File List Expected To Touch
- `test/integration/eval-complex.test.ts` (new)
- `test/unit/property/eval.property.test.ts` (new)
- `test/unit/eval.golden.test.ts` (new)
- `test/fixtures/gamedef/eval-complex-valid.json` (new)
- `test/fixtures/trace/eval-state-snapshot.json` (new)

## Out Of Scope
- New runtime/effect/game-loop behavior.
- CLI command changes.
- Spatial evaluation implementation (Spec 07).
- Refactoring existing evaluator internals without a test-driven need.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/integration/eval-complex.test.ts`:
  - complex condition combining `pvar`, `gvar`, and `count(tokensInZone(...))` evaluates expected boolean.
- `test/unit/property/eval.property.test.ts`:
  - `evalCondition` returns boolean for valid condition trees.
  - `evalValue` avoids `NaN`/`Infinity` for valid integer-input expressions.
  - `intsInRange(a,b)` length equals `b-a+1` whenever `a <= b` and within configured bounds.
  - `evalQuery` enforces `maxQueryResults` (result length never exceeds it).
- `test/unit/eval.golden.test.ts`:
  - fixed state + complex condition yields stable expected boolean.
  - fixed state + aggregate expression yields stable expected number.
- Full baseline remains green:
  - `npm test`

### Invariants That Must Remain True
- Integration and property tests are deterministic and reproducible.
- Golden assertions lock semantic outputs, not incidental formatting.
- Evaluation layer remains pure with no state mutation observed across test runs.

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Added new integration, property-style, and golden eval tests.
  - Added reusable fixtures for a realistic GameDef and serialized GameState snapshot.
  - Updated ticket assumptions/scope to match actual repository baseline before implementation.
- Deviations from original plan:
  - No evaluator runtime changes were required; existing implementation already satisfied behavior once missing test layers were added.
  - Existing unit tests were retained as baseline; this ticket added only missing test categories.
- Verification results:
  - `npm test` passed (29/29 tests).
