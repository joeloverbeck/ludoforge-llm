# GAMSPECOM-007 - Actions, Triggers, and End-Condition Compilation

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Compile top-level actions, triggers, end conditions, and scoring sections into `GameDef` structures using selector/effect/condition lowering building blocks.

## Implementation Tasks
1. Implement `compile-actions.ts` for action compilation (`actor`, params, preconditions, cost, effects).
2. Compile triggers with deterministic order preservation.
3. Compile end conditions and scoring expressions through condition/value lowering.
4. Ensure stable lookup/index behavior for references to actions, phases, vars, token types, and zones.
5. Add unit tests for valid top-level lowering and deterministic ordering.

## File List (Expected to Touch)
- `src/cnl/compile-actions.ts` (new)
- `src/cnl/compiler.ts`
- `test/unit/cnl/compile-actions.test.ts` (new)
- `test/unit/cnl/compile-top-level.test.ts` (new)

## Out of Scope
- Macro expansion implementation details.
- Diagnostic sorting/dedup final pass.
- Adjacency and `validateGameDef` integration.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/compile-actions.test.js`
- `node --test dist/test/unit/cnl/compile-top-level.test.js`

### Invariants that must remain true
- Input action/trigger order is preserved in compiled output where semantic order matters.
- Actor/player selectors are normalized to valid `PlayerSel` representations.
- Unknown references produce deterministic blocking diagnostics with source-aware paths.
