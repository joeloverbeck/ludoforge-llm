# GAMSPECOM-008 - Pipeline Orchestration and Final Validation

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Assemble the full compile pipeline (`expand -> lower -> spatial validate -> gameDef validate -> deterministic diagnostics`) and enforce `gameDef: null` behavior on compile errors.

## Implementation Tasks
1. Wire `compileGameSpecToGameDef` to run all pipeline stages in spec order.
2. Integrate Spec 07 adjacency validation diagnostics merge.
3. Integrate `validateGameDef` diagnostics merge.
4. Apply deterministic sort and dedupe to full diagnostic set.
5. Return `gameDef: null` when any error diagnostic exists; otherwise return compiled `GameDef`.
6. Ensure expansion idempotency path (`compile` on pre-expanded docs) remains deterministic.

## File List (Expected to Touch)
- `src/cnl/compiler.ts`
- `src/cnl/compiler-diagnostics.ts`
- `src/cnl/index.ts`
- `test/unit/cnl/compiler.test.ts` (new)
- `test/integration/cnl/compile-pipeline.test.ts` (new)

## Out of Scope
- New macro types beyond Spec 08b.
- Kernel runtime execution behavior changes.
- Parser/validator (Spec 08a) rule changes.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/compiler.test.js`
- `node --test dist/test/integration/cnl/compile-pipeline.test.js`
- `npm test`

### Invariants that must remain true
- Compiler never throws for user-authored inputs; errors are represented as diagnostics.
- If returned diagnostics include no errors, `validateGameDef` yields zero errors.
- Diagnostics are stable ordered by source offset, then `path`, severity rank, then `code`.
- Duplicate-equivalent diagnostics are removed deterministically.
