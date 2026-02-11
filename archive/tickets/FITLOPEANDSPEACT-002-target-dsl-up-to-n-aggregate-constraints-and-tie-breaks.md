# FITLOPEANDSPEACT-002 - Target DSL: Up-to-N, Aggregate Constraints, and Tie-Break Contracts

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001`

## Goal
Close the Spec 15a expressiveness gap by adding reusable optional-cardinality target selection (`up to N`), aggregate/cross-space constraint validation, and required explicit tie-break metadata when player choice is absent.

## Assumption Reassessment (2026-02-11)
- `aggregate` value expressions and cross-space predicates are already supported in current compiler/runtime paths (`compile-conditions`, `eval-condition`, `eval-query`) and already covered by existing unit tests.
- Explicit tie-break metadata enforcement for non-choice target resolution is not yet grounded in a concrete operation-targeting schema/runtime path in this ticket's touched modules; implementing it here would require broader operation profile targeting design work.
- The concrete gap in current code for this ticket is optional-cardinality selection semantics: `chooseN` is currently exact-length only.

## Scope
- Extend effect/target DSL to represent optional/range cardinality for `chooseN` without ambiguity:
  - exact `n` (existing behavior, unchanged),
  - `0..max` (`up to N`),
  - `min..max`.
- Add compiler/schema/runtime diagnostics for contradictory or invalid cardinality declarations.
- Confirm aggregate/cross-space condition support remains valid via regression tests.
- Defer tie-break metadata enforcement to a follow-up ticket tied to operation-profile target-resolution contracts.

## File list it expects to touch
- `src/kernel/types.ts`
- `src/cnl/compile-effects.ts`
- `src/cnl/validate-spec.ts`
- `src/kernel/schemas.ts`
- `schemas/GameDef.schema.json`
- `test/unit/compile-effects.test.ts`
- `test/unit/effects-choice.test.ts`
- `test/unit/validate-gamedef.test.ts`

## Out of scope
- Full operation execution pipeline (cost spend, apply effects, partial policy).
- FITL operation catalog data entries.
- Free/limited-operation card-flow interactions.
- Coup and victory rules (Spec 19).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compile-effects.test.js`
- `node --test dist/test/unit/effects-choice.test.js`
- `node --test dist/test/unit/validate-gamedef.test.js`

## Invariants that must remain true
- Exact `chooseN` semantics remain unchanged.
- `chooseN` range semantics are deterministic and validated uniformly in compiler/schema/runtime.
- Aggregate validation remains generic and reusable, not FITL-branch-based.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Added backward-compatible `chooseN` cardinality range support (`max`, optional `min`) while preserving existing exact `n` semantics.
  - Added compiler diagnostics for invalid or contradictory `chooseN` cardinality declarations.
  - Added runtime and `validateGameDef` guards for invalid cardinality declarations and range violations.
  - Updated kernel/Zod/JSON schema contracts and expanded unit coverage for range-cardinality behavior.
- **Deviation from original plan**:
  - Tie-break metadata enforcement was deferred. Current operation-profile targeting contracts do not yet define the concrete non-choice target-resolution metadata path needed for robust implementation in this ticket.
  - Aggregate/cross-space condition capability was already implemented; this ticket verified and preserved those capabilities rather than introducing new engine behavior there.
- **Verification**:
  - `npm run build`
  - `node --test dist/test/unit/compile-effects.test.js`
  - `node --test dist/test/unit/effects-choice.test.js`
  - `node --test dist/test/unit/validate-gamedef.test.js`
  - `node --test dist/test/unit/schemas-ast.test.js`
  - `npm test`
