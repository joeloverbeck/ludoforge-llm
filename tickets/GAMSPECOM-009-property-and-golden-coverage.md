# GAMSPECOM-009 - Property and Golden Coverage for Spec Compiler

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Add confidence tests that lock deterministic compiler behavior: full-path integration, property-style invariants, and representative golden snapshots.

## Implementation Tasks
1. Add integration fixture coverage for valid and malformed game specs through parse/validate/expand/compile/validate.
2. Add property-style tests for:
   - zero-error compile implies zero `validateGameDef` errors
   - diagnostic field non-emptiness
   - stable ordering under YAML key reorderings
3. Add golden snapshots for:
   - representative full valid `GameSpecDoc -> GameDef`
   - representative malformed spec diagnostics (`code`, `path`, `suggestion`).
4. Ensure snapshots are deterministic and reviewed for intentional ordering semantics.

## File List (Expected to Touch)
- `test/integration/cnl/compile-pipeline.test.ts`
- `test/unit/property/compiler.property.test.ts` (new)
- `test/unit/cnl/compiler.golden.test.ts` (new)
- `test/fixtures/cnl/compiler/` (new fixture directory)

## Out of Scope
- New compiler features.
- Parser/validator feature expansion unrelated to compiler coverage.
- Changes to kernel rule semantics.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/property/compiler.property.test.js`
- `node --test dist/test/unit/cnl/compiler.golden.test.js`
- `node --test dist/test/integration/cnl/compile-pipeline.test.js`
- `npm test`

### Invariants that must remain true
- Test suite verifies deterministic output and deterministic diagnostic ordering.
- Golden fixtures assert diagnostics include required contract fields.
- No test weakens existing invariants to accommodate buggy behavior.
