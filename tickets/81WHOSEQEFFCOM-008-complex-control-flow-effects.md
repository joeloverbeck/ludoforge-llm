# 81WHOSEQEFFCOM-008: Compile complex control flow effects (evaluateSubset, rollRandom, pushInterruptPhase)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md, archive/tickets/81WHOSEQEFFCOM-002-variable-binding-leaf-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-005-token-effects.md, tickets/81WHOSEQEFFCOM-006-iteration-reduction-effects.md

## Problem

Three complex control flow effects (tags 33, 27, 25) fall back to the interpreter. `evaluateSubset` is the highest-impact single compilation target for Texas Hold'em — it runs the hand-ranking chain C(7,5) = 21 times per player per showdown, with each chain containing ~15 effects. `rollRandom` and `pushInterruptPhase` are simpler but still require compilation for 100% lifecycle coverage.

## Assumption Reassessment (2026-03-25)

1. `evaluateSubset` (tag 33) is implemented in `effects-subset.ts` (~150 lines). It enumerates C(n,k) combinations (capped at 10K), evaluates an inner effect body for each combination, tracks the best score, and exports `bestBind` and optional `bestScoreBind`. Decision scope rebasing per combination.
2. `rollRandom` (tag 27) is implemented in `effects-control.ts` or `effects-turn-flow.ts`. Consumes RNG to generate a random value within a range, binds the result, and optionally executes inner effects.
3. `pushInterruptPhase` (tag 25) is implemented in `effects-turn-flow.ts`. Pushes a phase onto `state.interruptPhaseStack` with state manipulation.
4. `evaluateSubset` is marked "Extreme" complexity in the spec. It has the highest per-compilation performance impact due to C(7,5) * ~15 effects per showdown in Texas Hold'em.
5. The combination cap (`countCombinations(n, k)` capped at 10K) is a Foundation 6 (Bounded Computation) requirement.

## Architecture Check

1. `evaluateSubset` is the most performance-critical compilation target. Its inner body is evaluated C(n,k) times — compiling the body means each combination runs as composed closures instead of ~15 interpreter dispatches each.
2. The compiled closure must: enumerate combinations, evaluate inner body per combination, track best score, rebase decision scope per combination, export `bestBind` and `bestScoreBind`.
3. `rollRandom` is straightforward in lifecycle context — always deterministic (no player suspension). Consume RNG, bind result, execute optional inner effects.
4. `pushInterruptPhase` pushes to the interrupt stack. Similar to `popInterruptPhase` (ticket 004) but in reverse.
5. If `pushInterruptPhase` is implemented as a thin delegate to existing turn-flow handlers, it should reuse the shared compiled delegate helper established in earlier tickets instead of adding another one-off wrapper.

## What to Change

### 1. Add pattern descriptors

In `effect-compiler-patterns.ts`:
- `EvaluateSubsetPattern`: collection, subset size (k), inner body effects, score expression, `bestBind`, optional `bestScoreBind`, optional `subsetBind`
- `RollRandomPattern`: min/max range, bind name, optional inner body effects
- `PushInterruptPhasePattern`: target phase, optional state initialization
- Add `matchEvaluateSubset`, `matchRollRandom`, `matchPushInterruptPhase`
- Wire into `classifyEffect` switch for tags 33, 27, 25

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileEvaluateSubset(desc, bodyCompiler)` — enumerate C(n,k) combinations (capped), compile inner body, evaluate per combination, track best score (comparison), decision scope rebasing per combination, export `bestBind`/`bestScoreBind`
- `compileRollRandom(desc, bodyCompiler)` — consume RNG for range [min, max], bind result, compile and execute optional inner body
- `compilePushInterruptPhase(desc)` — push phase to interrupt stack, initialize state
- If `compilePushInterruptPhase` delegates to an existing runtime handler, implement it via the shared codegen delegate helper
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- `chooseOne`/`chooseN` (ticket 009)
- Deleting `createFallbackFragment` (ticket 010)
- Optimizing combination enumeration algorithm (use existing `countCombinations` infrastructure)
- Action-context effects (`grantFreeOperation`)
- CPS/coroutine compilation for action effects (future spec)

## Acceptance Criteria

### Tests That Must Pass

1. Per-effect-type unit test: `compileEvaluateSubset` enumerates correct combinations, evaluates inner body, returns correct `bestBind` and `bestScoreBind`
2. Per-effect-type unit test: `compileRollRandom` consumes RNG deterministically, binds result within range, executes inner body
3. Per-effect-type unit test: `compilePushInterruptPhase` pushes correct phase to stack
4. Parity test: evaluateSubset compiled output matches interpreted output for Texas Hold'em hand evaluation scenario
5. Parity test: rollRandom compiled output matches interpreted output
6. Parity test: pushInterruptPhase compiled output matches interpreted output
7. Combination cap test: evaluateSubset respects 10K combination cap (Foundation 6)
8. Decision scope test: evaluateSubset correctly rebases `iterationPath` per combination
9. Binding export test: evaluateSubset exports `bestBind` and `bestScoreBind` correctly
10. Edge case tests: evaluateSubset with 0 items, rollRandom with min == max, pushInterruptPhase on non-empty stack
11. Trace parity test: all three effects emit identical trace entries to interpreted path
12. Existing suite: `pnpm turbo test`
13. Existing suite: `pnpm turbo typecheck`

### Invariants

1. `evaluateSubset` combination cap (10K) enforced identically to interpreted path
2. `evaluateSubset` binding export (`bestBind`, `bestScoreBind`) matches interpreted path
3. Decision scope rebasing in `evaluateSubset` is identical to interpreted path
4. `rollRandom` RNG consumption is identical to interpreted path (determinism preserved)
5. Coverage ratio reaches >= 95% for typical lifecycle sequences after this ticket
6. Verification mode passes for all lifecycle sequences

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for all 3 compiled effect generators
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for match functions
3. Consider a dedicated parity test for Texas Hold'em showdown evaluation (highest-impact scenario)

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
