# 81WHOSEQEFFCOM-008: Compile complex control flow effects (evaluateSubset, rollRandom, pushInterruptPhase)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md, archive/tickets/81WHOSEQEFFCOM-002-variable-binding-leaf-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-005-token-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-006-iteration-reduction-effects.md

## Problem

Three complex control flow effects (tags 33, 27, 25) fall back to the interpreter. `evaluateSubset` is the highest-impact single compilation target for Texas Hold'em — it runs the hand-ranking chain C(7,5) = 21 times per player per showdown, with each chain containing ~15 effects. `rollRandom` and `pushInterruptPhase` are simpler but still require compilation for 100% lifecycle coverage.

## Assumption Reassessment (2026-03-25)

1. `evaluateSubset` (tag 33) is implemented in `packages/engine/src/kernel/effects-subset.ts`. It enumerates combinations via `combinations(items, subsetSize)`, enforces a 10K cap through `countCombinations`, runs `compute`, evaluates `scoreExpr`, and exports `resultBind` plus optional `bestSubsetBind`. The current runtime does not define any dedicated `evaluateSubset` decision-scope rebasing beyond whatever nested effects do themselves.
2. `rollRandom` (tag 27) is implemented in `packages/engine/src/kernel/effects-choice.ts`, not in `effects-control.ts` / `effects-turn-flow.ts`. That is architecturally important because the runtime handler serves both execution and discovery semantics, including fixed bindings and stochastic pending-choice aggregation.
3. `pushInterruptPhase` (tag 25) is implemented in `packages/engine/src/kernel/effects-turn-flow.ts` as a turn-flow leaf effect with payload `{ phase, resumePhase }`. There is no optional initialization payload.
4. `evaluateSubset` remains the highest-impact compilation target in this ticket because Texas Hold'em showdown evaluation executes the nested compute chain repeatedly (`C(7,5) = 21` subsets per player).
5. The combination cap (`countCombinations(n, k) <= 10_000`) is a Foundation 6 (Bounded Computation) requirement and must remain runtime-enforced in the compiled path.
6. The current compiler already has a shared delegate helper for compiled leaf wrappers (`executeCompiledDelegate` in `effect-compiler-codegen.ts`). This ticket should reuse it for `pushInterruptPhase` rather than add another wrapper shape.
7. Ticket 006 correctly exposed some duplicated control-flow plumbing across compiled and interpreted paths, but the present codebase does not yet have a shared kernel-internal helper for that. Any cleanup introduced here must stay small, generic, and directly justified by these three effects.

## Architecture Check

1. `evaluateSubset` is the most performance-critical compilation target. Its inner body is evaluated C(n,k) times — compiling the body means each combination runs as composed closures instead of ~15 interpreter dispatches each.
2. The compiled `evaluateSubset` closure must preserve the runtime contract exactly: enumerate combinations, execute `compute`, evaluate `scoreExpr`, export `resultBind` plus optional `bestSubsetBind`, and preserve nested pending-choice short-circuiting. It should not invent new binding names or decision-scope behavior that the interpreter does not define.
3. `rollRandom` has two architectural concerns:
   - In lifecycle execution, it is a simple deterministic RNG consumer plus nested continuation.
   - In generic runtime usage, it also has discovery semantics. Because Spec 81 targets lifecycle compilation, this ticket should preserve runtime parity for execution/fixed-binding behavior and avoid broadening lifecycle compilation into a second choice-engine implementation.
4. `pushInterruptPhase` is a turn-flow transition, not a performance hotspot. A thin compiled delegate to the canonical runtime handler is cleaner than duplicating phase-enter/exit, stack, and Zobrist-update logic in codegen.
5. If a shared internal helper is introduced for `evaluateSubset` / `rollRandom`, it should be limited to mechanics actually shared by those compiled closures. Avoid a speculative "control-flow framework" in this ticket.
6. Delegate-backed leaf-wrapper consolidation remains tracked separately in `archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-011-delegate-leaf-wrapper-consolidation.md`. This ticket should reuse existing delegate infrastructure, not fork it.

## What to Change

### 1. Add pattern descriptors

In `effect-compiler-patterns.ts`:
- `EvaluateSubsetPattern`: `source`, `subsetSize`, `subsetBind`, `compute`, `scoreExpr`, `resultBind`, optional `bestSubsetBind`, `in`
- `RollRandomPattern`: min/max range, bind name, optional inner body effects
- `PushInterruptPhasePattern`: target phase and `resumePhase`
- Add `matchEvaluateSubset`, `matchRollRandom`, `matchPushInterruptPhase`
- Wire into `classifyEffect` switch for tags 33, 27, 25

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileEvaluateSubset(desc, bodyCompiler)` — enumerate C(n,k) combinations (capped), compile `compute`, evaluate `scoreExpr`, track best score, export `resultBind` / optional `bestSubsetBind`, then execute compiled `in`
- `compileRollRandom(desc, bodyCompiler)` — for lifecycle execution/fixed-binding behavior, consume RNG for `[min, max]`, bind the result, and execute compiled `in` with interpreter-parity binding/export semantics
- `compilePushInterruptPhase(desc)` — push phase to interrupt stack by delegating to the canonical turn-flow handler
- If `compilePushInterruptPhase` delegates to an existing runtime handler, implement it via the shared codegen delegate helper
- Wire into `compilePatternDescriptor` dispatcher

### 3. Preferred architectural cleanup while implementing complex control flow

If the implementation starts repeating low-level mechanics already present in compiled control-flow code, introduce a small shared helper instead of copying the pattern again.

Candidate responsibilities:
- bounded combination / range iteration
- continuation execution with pending-choice short-circuiting
- binding export filtering for scoped control-flow constructs

This helper must stay kernel-internal and game-agnostic. It is not a compatibility layer and must not preserve obsolete compiler-only naming splits.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- `chooseOne`/`chooseN` (ticket 009)
- Deleting `createFallbackFragment` (ticket 010)
- Optimizing combination enumeration algorithm (use existing `countCombinations` infrastructure)
- Action-context effects (`grantFreeOperation`)
- CPS/coroutine compilation for action effects (future spec)
- Broad refactors outside control-flow ownership areas unrelated to this duplication problem

## Acceptance Criteria

### Tests That Must Pass

1. Per-effect-type unit test: `compileEvaluateSubset` enumerates correct combinations, evaluates compiled `compute`, and exports `resultBind` / `bestSubsetBind` correctly
2. Per-effect-type unit test: `compileRollRandom` consumes RNG deterministically, respects fixed bindings, and executes compiled `in`
3. Per-effect-type unit test: `compilePushInterruptPhase` matches interpreter state/rng parity on empty and non-empty interrupt stacks
4. Parity test: `evaluateSubset` compiled output matches interpreted output for a representative Texas Hold'em-style scoring chain
5. Parity test: `rollRandom` compiled output matches interpreted output for lifecycle execution semantics
6. Parity test: `pushInterruptPhase` compiled output matches interpreted output
7. Combination cap test: `evaluateSubset` respects the 10K combination cap (Foundation 6)
8. Edge case tests: `evaluateSubset` with empty subset selection, `rollRandom` with `min == max`, `rollRandom` with `min > max`, `pushInterruptPhase` on non-empty stack
9. Coverage regression test updates: tags 25, 27, and 33 are now counted as compiled
10. Existing suite: `pnpm -F @ludoforge/engine test`
11. Existing suite: `pnpm turbo typecheck`
12. Existing suite: `pnpm turbo lint`

### Invariants

1. `evaluateSubset` combination cap (10K) enforced identically to interpreted path
2. `evaluateSubset` binding export (`resultBind`, optional `bestSubsetBind`) matches interpreted path
3. `rollRandom` RNG consumption and fixed-binding behavior match interpreted path (determinism preserved)
4. `pushInterruptPhase` remains delegated to the canonical turn-flow implementation
5. Coverage ratios and verification behavior improve only by counting these three tags as compiled; this ticket does not remove the fallback path or guarantee global `coverageRatio === 1`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — add generator/parity tests for `evaluateSubset`, `rollRandom`, and `pushInterruptPhase`
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — add classifier assertions for the three new compiled tags and update coverage expectations
3. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — update fallback/coverage expectations where these tags no longer batch into interpreter fallback
4. Add a focused `evaluateSubset` parity case that resembles Texas Hold'em-style repeated scoring, but do not require a full game-level showdown fixture unless the existing unit harness proves insufficient

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-25
- What actually changed:
  - Added compiler pattern descriptors and codegen support for `evaluateSubset`, `rollRandom`, and `pushInterruptPhase`.
  - Reused the existing compiled delegate helper for `pushInterruptPhase`.
  - Preserved interpreter semantics for `evaluateSubset` compute-state ephemerality and for `rollRandom` binding visibility.
  - Updated compiler coverage/fallback tests now that tags 25, 27, and 33 are compiled.
- Deviations from original plan:
  - The original ticket assumed non-existent `bestBind` / `bestScoreBind` outputs and `evaluateSubset` decision-scope rebasing. The implementation followed the real runtime contract instead: `resultBind`, optional `bestSubsetBind`, and no new decision-scope semantics.
  - `rollRandom` was implemented for lifecycle execution/fixed-binding parity, not as a second full discovery-mode choice engine in compiled code.
  - No broad shared control-flow helper was introduced; the existing delegate helper was sufficient, and speculative framework work was intentionally avoided.
- Verification results:
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
