# KERCONVALQUEEVA-007 - Evaluator Unit Coverage Matrix Completion

**Status**: TODO

## Goal
Close all Spec 04-required unit coverage gaps for selector/reference/query/value/condition error cases and edge behavior.

## Scope
- Expand test vectors to include all required failure paths and invariants not covered by earlier module tickets.
- Add explicit tests for descriptive error context fields (available bindings/vars/candidates).
- Add edge-case tests for query bounds, selector cardinality, and integer safety boundaries.

## File List Expected To Touch
- `test/unit/resolve-selectors.test.ts`
- `test/unit/resolve-ref.test.ts`
- `test/unit/eval-query.test.ts`
- `test/unit/eval-value.test.ts`
- `test/unit/eval-condition.test.ts`

## Out Of Scope
- New evaluator functionality beyond what Spec 04 already requires.
- Integration/property/golden testing (handled separately).
- Refactoring test harnesses unrelated to evaluator behavior.

## Acceptance Criteria
### Specific Tests That Must Pass
- Add/verify explicit unit tests for:
  - `tokenProp` unbound token error includes available binding names.
  - missing `binding` error includes available binding names.
  - `pvar`/`zoneCount` multi-target scalar-selector failures are typed cardinality errors.
  - `intsInRange` exact cardinality formula when `min <= max`.
  - arithmetic safe-integer guard failures (overflow/non-safe integers) throw `TYPE_MISMATCH`.
  - spatial query stubs consistently throw `SPATIAL_NOT_IMPLEMENTED` with query identifier in message.
- Entire unit suite remains green:
  - `npm run test:unit -- --coverage=false`

### Invariants That Must Remain True
- Error assertions remain stable on error `code` and essential message context.
- Unit tests remain deterministic and seed-free.
- No test relies on object key iteration order where sort guarantees are required.
