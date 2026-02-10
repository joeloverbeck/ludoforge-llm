# SPAMOD-003 - Thread Adjacency Graph Through Eval/Effect Contexts

**Status**: ✅ COMPLETED  
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

## Reassessed Assumptions (2026-02-10)
- `adjacencyGraph` is not yet present in either `EvalContext` or `EffectContext`.
- The call-site list in this ticket is directionally correct, but incomplete for test impact:
  direct context construction exists in multiple unit/integration/property tests that must be updated if `adjacencyGraph` is required.
- Runtime trigger recursion currently re-creates eval/effect contexts per trigger; this ticket should ensure those contexts reuse one graph instance per top-level operation path.

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
- `test/unit/*eval*.test.ts` (files that construct `EvalContext` directly)
- `test/unit/*effects*.test.ts` (files that construct `EffectContext` directly)
- `test/integration/*eval*.test.ts` and `test/integration/*effects*.test.ts` (if they construct contexts directly)
- `test/unit/property/*.test.ts` (property helpers that construct contexts directly)

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
- Direct-context tests in unit/integration/property suites compile and pass with required `adjacencyGraph`.
- `npm run typecheck`
- `npm test`

## Invariants That Must Remain True
- Game loop behavior is unchanged when no spatial features are used.
- Context objects remain immutable in runtime logic.
- Adjacency graph is built once per top-level operation path and reused for nested eval/effect calls.

## Outcome
- Completion date: 2026-02-10
- Actual changes:
  - Added required `adjacencyGraph` to `EvalContext` and `EffectContext`.
  - Threaded a single prebuilt graph through `legalMoves`, `terminalResult`, `initialState`, and `applyMove`.
  - Updated `dispatchTriggers` to accept an optional prebuilt `adjacencyGraph` and reuse it for recursive cascades.
  - Updated direct-context unit/integration/property tests to provide required `adjacencyGraph`.
  - Added coverage for passing a prebuilt adjacency graph to `dispatchTriggers`.
- Deviations from original plan:
  - Test touch surface was larger than initially listed because many tests construct contexts directly.
  - Public API compatibility was preserved by making the new `dispatchTriggers` graph parameter optional.
- Verification results:
  - `npm run typecheck` passed.
  - `npm test` passed.
