# GAMSPECOM-009 - Property and Golden Coverage for Spec Compiler

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Add confidence tests that lock deterministic compiler behavior: full-path integration, property-style invariants, and representative golden snapshots.

## Assumption Reassessment
- Existing integration coverage already exists at `test/integration/compile-pipeline.test.ts` (not `test/integration/cnl/compile-pipeline.test.ts`).
- Existing parser/validator fixtures in `test/fixtures/cnl/` are not fully compiler-valid (for example `full-valid-spec.md` uses `actor.currentPlayer`, which currently compiles with `CNL_COMPILER_PLAYER_SELECTOR_INVALID`).
- This ticket should extend current coverage rather than introducing a parallel `test/unit/cnl/` directory.
- Therefore this ticket adds dedicated compiler fixtures under `test/fixtures/cnl/compiler/` for compile-valid and compile-invalid snapshots.

## Implementation Tasks
1. Extend `test/integration/compile-pipeline.test.ts` with fixture-based coverage for valid and malformed game specs through parse/validate/expand/compile/validate.
2. Add property-style tests for:
   - zero-error compile implies zero `validateGameDef` errors
   - diagnostic field non-emptiness
   - stable ordering under YAML key reorderings
3. Add compiler golden snapshots for:
   - representative full valid `GameSpecDoc -> GameDef`
   - representative malformed spec diagnostics (`code`, `path`, `suggestion`).
4. Ensure snapshots are deterministic and reviewed for intentional ordering semantics.

## File List (Expected to Touch)
- `test/integration/compile-pipeline.test.ts`
- `test/unit/property/compiler.property.test.ts` (new)
- `test/unit/compiler.golden.test.ts` (new)
- `test/fixtures/cnl/compiler/` (new compiler fixture directory)

## Out of Scope
- New compiler features.
- Parser/validator feature expansion unrelated to compiler coverage.
- Changes to kernel rule semantics.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/property/compiler.property.test.js`
- `node --test dist/test/unit/compiler.golden.test.js`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `npm test`

### Invariants that must remain true
- Test suite verifies deterministic output and deterministic diagnostic ordering.
- Golden fixtures assert diagnostics include required contract fields.
- No test weakens existing invariants to accommodate buggy behavior.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Extended `test/integration/compile-pipeline.test.ts` with fixture-driven parse/validate/expand/compile/validate coverage for compile-valid and malformed specs.
  - Added `test/unit/property/compiler.property.test.ts` for compiler invariants:
    - zero-error compile implies zero `validateGameDef` errors
    - diagnostic required fields are non-empty
    - stable diagnostic ordering under YAML key reorderings
  - Added `test/unit/compiler.golden.test.ts` with compiler golden snapshots.
  - Added compiler-specific fixtures and golden snapshots under `test/fixtures/cnl/compiler/`.
- **Deviations from original plan**:
  - Corrected file paths to existing repo layout (`test/integration/compile-pipeline.test.ts`, `test/unit/compiler.golden.test.ts`).
  - Introduced dedicated compiler fixtures because existing `test/fixtures/cnl/full-valid-spec.md` is parser/validator-valid but not compiler-valid.
- **Verification**:
  - `npm run build`
  - `node --test dist/test/unit/property/compiler.property.test.js`
  - `node --test dist/test/unit/compiler.golden.test.js`
  - `node --test dist/test/integration/compile-pipeline.test.js`
  - `npm test`
