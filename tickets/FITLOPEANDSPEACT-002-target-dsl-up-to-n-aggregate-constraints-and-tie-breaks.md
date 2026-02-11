# FITLOPEANDSPEACT-002 - Target DSL: Up-to-N, Aggregate Constraints, and Tie-Break Contracts

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001`

## Goal
Close the Spec 15a expressiveness gap by adding reusable optional-cardinality target selection (`up to N`), aggregate/cross-space constraint validation, and required explicit tie-break metadata when player choice is absent.

## Scope
- Extend effect/target DSL to represent `0..N` cardinality without ambiguity.
- Support aggregate constraints over candidate sets and cross-space predicates.
- Require explicit deterministic tie-break policy for non-choice target resolution.
- Add compiler diagnostics for missing tie-break metadata or contradictory constraints.

## File list it expects to touch
- `src/kernel/types.ts`
- `src/cnl/compile-effects.ts`
- `src/cnl/compile-conditions.ts`
- `src/cnl/validate-spec.ts`
- `src/kernel/resolve-selectors.ts`
- `src/kernel/eval-query.ts`
- `src/kernel/eval-condition.ts`
- `src/kernel/schemas.ts`
- `schemas/GameDef.schema.json`
- `test/unit/compile-effects.test.ts`
- `test/unit/compile-conditions.test.ts`
- `test/unit/resolve-selectors.test.ts`
- `test/unit/eval-query.test.ts`
- `test/unit/effects-choice.test.ts`

## Out of scope
- Full operation execution pipeline (cost spend, apply effects, partial policy).
- FITL operation catalog data entries.
- Free/limited-operation card-flow interactions.
- Coup and victory rules (Spec 19).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compile-effects.test.js`
- `node --test dist/test/unit/compile-conditions.test.js`
- `node --test dist/test/unit/resolve-selectors.test.js`
- `node --test dist/test/unit/eval-query.test.js`
- `node --test dist/test/unit/effects-choice.test.js`

## Invariants that must remain true
- Exact `chooseN` semantics remain unchanged.
- Any non-choice multi-target resolution order is deterministic and traceable.
- Aggregate validation is generic and reusable, not FITL-branch-based.
- Same seed and same choices yield identical selector resolution results.
