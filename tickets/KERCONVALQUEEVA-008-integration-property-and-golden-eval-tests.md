# KERCONVALQUEEVA-008 - Integration, Property, and Golden Evaluation Tests

**Status**: TODO

## Goal
Add high-confidence evaluation-layer tests that lock end-to-end behavior and invariants beyond unit scope.

## Scope
- Add one realistic integration scenario validating combined selector/reference/query/value/condition evaluation.
- Add deterministic property-style tests for key evaluator invariants.
- Add golden fixtures/assertions for complex condition and aggregate outputs.

## File List Expected To Touch
- `test/integration/eval-complex.test.ts`
- `test/unit/property/eval.property.test.ts`
- `test/unit/eval.golden.test.ts`
- `test/fixtures/gamedef/eval-complex-valid.json`
- `test/fixtures/trace/eval-state-snapshot.json`

## Out Of Scope
- New runtime/effect/game-loop behavior.
- CLI command changes.
- Spatial evaluation implementation (Spec 07).

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/integration/eval-complex.test.ts`:
  - complex condition using `pvar`, `gvar`, and `count(tokensInZone(...))` evaluates expected boolean.
- `test/unit/property/eval.property.test.ts`:
  - `evalCondition` returns boolean for generated valid condition trees.
  - `evalValue` avoids `NaN`/`Infinity` for valid integer-input expressions.
  - `intsInRange(a,b)` length equals `b-a+1` whenever `a <= b` and within configured bounds.
  - `evalQuery` never exceeds `maxQueryResults`.
- `test/unit/eval.golden.test.ts`:
  - fixed state + complex condition yields stable expected boolean.
  - fixed state + aggregate expression yields stable expected number.
- Full baseline remains green:
  - `npm test`

### Invariants That Must Remain True
- Integration and property tests are deterministic and reproducible.
- Golden assertions only lock stable semantic outputs, not incidental object formatting.
- Evaluation layer remains pure with no state mutation observed across test runs.
