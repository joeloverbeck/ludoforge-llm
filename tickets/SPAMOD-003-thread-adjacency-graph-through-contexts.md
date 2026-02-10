# SPAMOD-003 - Thread Adjacency Graph Through Eval/Effect Contexts

**Status**: Proposed  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-002`

## Goal
Build `AdjacencyGraph` once per `GameDef` usage path and thread it through runtime contexts so spatial operations do not rebuild topology per call.

## Scope
- Extend `EvalContext` and `EffectContext` with `adjacencyGraph`.
- Update all call sites that construct eval/effect contexts:
  - `legal-moves`
  - `terminal`
  - `initial-state`
  - `apply-move`
  - `trigger-dispatch`
- Ensure nested effect/eval contexts preserve the same graph instance.

## File List Expected To Touch
- `src/kernel/eval-context.ts`
- `src/kernel/effect-context.ts`
- `src/kernel/legal-moves.ts`
- `src/kernel/terminal.ts`
- `src/kernel/initial-state.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/trigger-dispatch.ts`
- `test/unit/game-loop-api-shape.test.ts`
- `test/unit/effects-runtime.test.ts`

## Out Of Scope
- Spatial query/condition/effect semantics.
- Adjacency diagnostics logic.
- CNL macro/compiler work.
- Performance benchmarking harness additions.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/game-loop-api-shape.test.ts`
  - public APIs still expose expected function signatures/return shapes.
- `test/unit/effects-runtime.test.ts`
  - context creation still supports no-op/limit behavior under new required fields.
- `npm run typecheck`
- `npm test`

## Invariants That Must Remain True
- Game loop behavior is unchanged when no spatial features are used.
- Context objects remain immutable in runtime logic.
- Adjacency graph is built once per top-level operation path and reused for nested eval/effect calls.

