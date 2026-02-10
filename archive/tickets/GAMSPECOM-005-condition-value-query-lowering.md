# GAMSPECOM-005 - Condition/Value/Query Lowering

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Lower CNL shorthand condition/value/query nodes into kernel-compatible AST forms with deterministic diagnostics for unsupported constructs.

## Reassessed Assumptions (2026-02-10)
- `src/cnl/compiler.ts` currently returns `CNL_COMPILER_NOT_IMPLEMENTED`; full action/guard lowering integration is not yet available in this repository slice.
- Selector and zone canonicalization helpers already exist in `src/cnl/compile-selectors.ts` and `src/cnl/compile-zones.ts`.
- Unit tests for CNL compiler pieces live under `test/unit/` (not `test/unit/cnl/`).
- This ticket can be completed by introducing a pure, standalone lowering module plus focused unit tests, without changing public compiler API behavior.

## Implementation Tasks
1. Implement `compile-conditions.ts` with pure lowering helpers for condition/value/query nodes.
2. Canonicalize zone and player selector-bearing nodes via existing selector/zone utilities.
3. Detect non-representable source constructs and emit `CNL_COMPILER_MISSING_CAPABILITY` with alternatives when available.
4. Add focused unit tests covering valid lowering and missing-capability paths.
5. Export the new helpers through `src/cnl/index.ts`.

## File List (Expected to Touch)
- `src/cnl/compile-conditions.ts` (new)
- `src/cnl/index.ts`
- `test/unit/compile-conditions.test.ts` (new)

## Out of Scope
- Effect/control-flow lowering (`if`, `forEach`, `let`, `choose*`).
- Binding scope validation.
- Top-level action/trigger assembly.
- Replacing `compileGameSpecToGameDef` stub behavior in `src/cnl/compiler.ts`.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compile-conditions.test.js`
- `npm run test:unit -- --test-name-pattern=compile-conditions`

### Invariants that must remain true
- Lowering functions are deterministic and side-effect free.
- No kernel AST node is produced with unresolved shorthand-only fields.
- Missing-capability diagnostics always include `code`, `path`, `severity`, and `message`.

## Outcome
- Completion date: 2026-02-10
- Implemented:
  - Added `src/cnl/compile-conditions.ts` with pure lowering helpers:
    - `lowerConditionNode`
    - `lowerValueNode`
    - `lowerQueryNode`
  - Added selector canonicalization integration for zone/player selector-bearing nodes using existing shared utilities.
  - Added deterministic missing-capability diagnostics for non-representable condition/value/query constructs, including alternatives when applicable.
  - Added `test/unit/compile-conditions.test.ts` covering valid lowering paths, selector-canonicalization paths, and missing-capability behavior.
  - Exported the new module via `src/cnl/index.ts`.
- Deviations from original plan:
  - Did not modify `src/cnl/compiler.ts` integration because the compiler entrypoint is still intentionally stubbed (`CNL_COMPILER_NOT_IMPLEMENTED`) in the current repo slice.
  - Updated test path assumptions from `test/unit/cnl/*` to existing repository convention `test/unit/*`.
- Verification:
  - `npm run build` passed.
  - `node --test dist/test/unit/compile-conditions.test.js` passed.
  - `npm run test:unit -- --test-name-pattern=compile-conditions` passed.
