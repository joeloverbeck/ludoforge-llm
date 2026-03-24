# Spec 81 — Whole-Sequence Effect Compilation

**Status**: Draft
**Dependencies**: Spec 79 (Compiled Effect Path Redesign, completed), Spec 82
(Effect AST Type Tags, recommended but not required)
**Enables**: Order-of-magnitude performance improvement for simulation-heavy
workloads (agent evolution, MAP-Elites fitness evaluation).

## Problem

The effect interpreter dispatches ~150K individual effects per game through a
per-effect pipeline:

```
effectKindOf(effect) → consumeBudget → registry[kind](effect, env, cursor, budget, applyBatch) → normalizeResult
```

This dispatch overhead is unavoidable for an interpreter. V8 JIT-compiles the
dispatch loop effectively, but the overhead is multiplicative: 150K effects ×
~200ns dispatch cost = ~30ms of pure dispatch overhead per game.

More critically, **79% of applyMove time is concentrated in 498 phase-cascade
moves** (3.9% of all moves). These moves trigger showdown hand evaluation
via the `evaluateSubset` effect, which runs the full hand-ranking effect chain
21 times (C(7,5) combinations) per player per showdown. Each chain contains
~15 effects (let, if, reduce, bindValue), totaling ~13K let + ~3.6K if +
~563 reduce invocations per game — all through the interpreter.

### What Spec 79 Achieved

Spec 79 added compiled lifecycle effects for a subset of effect types. The
compiler generates JavaScript functions that bypass the per-effect dispatch
for supported types. However:

1. **Limited coverage**: Only "leaf" effects (setVar, addVar, moveToken, etc.)
   are compiled. Control flow effects (let, if, forEach, reduce,
   evaluateSubset) fall back to the interpreter.
2. **Fragment architecture**: Compiled effects are composed as an array of
   fragments. The fragment iteration loop has its own per-fragment overhead
   (context construction, result normalization).
3. **Net result**: The compiled path is only ~2.5% faster than the
   interpreter for Texas Hold'em, because most effects are control flow that
   falls back anyway.

### The V8 Optimization Wall

The performance campaign (14 experiments) proved that V8 micro-optimizations
cannot improve the interpreter further:
- Object allocation is ~5ns (V8 singleton/hidden-class optimized)
- `for-in` on single-key objects is optimal
- Mutable-cache patterns cause JIT deoptimization
- Control flow changes cause JIT deoptimization
- Template strings are ~0.04ns (V8 fast-path)

The only remaining lever is **eliminating the interpreter dispatch entirely**
by compiling whole effect sequences into native functions.

## Objective

Extend the effect compiler to generate native JavaScript functions for
**complete effect sequences**, including all control flow effects. A compiled
lifecycle effect receives `(state, rng)` and returns `(state, rng,
emittedEvents)` — the same contract as the interpreter, but as a single JIT-
optimizable function call instead of ~150K interpreter dispatches.

### Non-Goals

- Compiling action effects (deferred to future work — lifecycle effects are
  the highest-impact target)
- Compiling effects that require pending-choice suspension (chooseOne,
  chooseN, rollRandom in player-facing contexts)
- Replacing the interpreter (it remains the fallback for uncompilable effects
  and for verification)

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: The compiler is generic — it compiles
  any game's effect ASTs, not game-specific logic. A poker hand evaluator and
  a COIN wargame resolution use the same compiler.
- **Foundation 5 (Determinism)**: Compiled functions must produce bit-identical
  results to the interpreter. The existing verification mode (dual execution +
  Zobrist hash comparison, from Spec 79) is preserved and extended.
- **Foundation 6 (Bounded Computation)**: Compiled loops use the same
  bounds as interpreted loops — `queryResult.length` for forEach,
  `countCombinations(n, k)` cap for evaluateSubset, `repeat` count for
  explicit limits.
- **Foundation 7 (Immutability)**: Compiled functions use scoped internal
  mutation (DraftTracker, same as interpreter). External contract preserved.
- **Foundation 8 (Compiler-Kernel Boundary)**: The CNL compiler transforms
  effect ASTs into GameDef. The effect compiler transforms GameDef effect ASTs
  into JavaScript functions. The kernel executes them. No boundary violation —
  the effect compiler is a kernel-internal optimization.
- **Foundation 11 (Testing)**: Exhaustive parity tests between compiled and
  interpreted paths for all effect types.

## Design

### 1. Compilation Phases

The compiler extends `effect-compiler-codegen.ts` with code generators for
each control flow effect type:

#### Phase 1: let, if, bindValue (highest frequency)

```typescript
// Input AST:
{ let: { bind: 'handRank', value: { _t: 6, op: '+', left: ..., right: ... }, in: [...] } }

// Generated code:
function compiledLifecycleEnter(state, rng, env) {
  const _draft = createMutableState(state);
  const _tracker = createDraftTracker();
  let _bindings = {};
  // let handRank = <compiled value expression>
  const _v0 = evalValue(expr_handRank_value, { ...env, state: _draft, bindings: _bindings });
  _bindings = { ..._bindings, handRank: _v0 };
  // ... compiled inner effects ...
  return { state: _draft, rng, emittedEvents: _emitted };
}
```

#### Phase 2: forEach, reduce (iteration)

```typescript
// Input AST:
{ forEach: { over: { query: 'tokensIn', zone: 'hand-0' }, bind: 'card', effects: [...] } }

// Generated code:
const _items = evalQuery(forEachQuery, { ...env, state: _draft, bindings: _bindings });
for (let _i = 0; _i < _items.length; _i++) {
  _bindings = { ..._bindings, card: _items[_i] };
  // ... compiled inner effects ...
}
```

#### Phase 3: evaluateSubset (combination evaluation)

```typescript
// Input AST:
{ evaluateSubset: { source: ..., subsetSize: 5, subsetBind: 'hand', compute: [...], scoreExpr: ..., resultBind: 'bestScore', in: [...] } }

// Generated code:
const _source = evalQuery(sourceQuery, evalCtx);
const _subsetSize = evalValue(sizeExpr, evalCtx);
let _bestScore = -Infinity;
let _bestSubset = null;
for (const _subset of combinations(_source, _subsetSize)) {
  _bindings = { ..._bindings, hand: _subset };
  // ... compiled compute effects (inlined) ...
  const _score = evalValue(scoreExpr, { ...env, state: _draft, bindings: _bindings });
  if (_score > _bestScore) { _bestScore = _score; _bestSubset = [..._subset]; }
}
_bindings = { ..._bindings, bestScore: _bestScore, bestSubset: _bestSubset };
// ... compiled continuation effects ...
```

#### Phase 4: Remaining leaf effects

Leaf effects (setVar, addVar, moveToken, etc.) are already compiled by
Spec 79. Phase 4 integrates them into the whole-sequence output so the
compiled function has zero interpreter fallback.

### 2. Fallback Strategy

If any effect in a sequence cannot be compiled (e.g., a future effect type
not yet supported), the compiler marks the sequence as "partially compilable."
Two strategies:

**Option A (recommended)**: Fall back to the interpreter for the entire
sequence. The compiled path is all-or-nothing. This avoids the fragment
overhead that Spec 79 showed to be counterproductive.

**Option B**: Split the sequence at the uncompilable effect. Run compiled code
up to that point, call the interpreter for the unsupported effect, then
resume compiled code. This requires checkpoint/resume overhead.

### 3. Integration with GameDefRuntime

Compiled effect functions are stored in
`GameDefRuntime.compiledLifecycleEffects` (same as Spec 79, but the functions
are now whole-sequence). The `dispatchLifecycleEvent` function checks for a
compiled function and calls it directly, falling back to `applyEffects` if
none exists.

### 4. Verification Mode

The existing Spec 79 verification mode is extended:
- Run both compiled and interpreted paths for every lifecycle event
- Compare resulting `GameState` field-by-field (not just Zobrist hash)
- Log mismatches with full diagnostic context
- Enabled in CI and in the benchmark's determinism check

### 5. Value Expression Compilation

Many effects contain `evalValue` calls for value expressions. The whole-
sequence compiler can optionally inline simple value expressions:

- Literal values: inlined directly (`42`, `true`, `'fold'`)
- Binding references: `_bindings[name]`
- Arithmetic: `left + right`
- Condition expressions: `evalCondition(cond, ctx)`

Complex value expressions (aggregate, concat, query-dependent) delegate to the
existing `evalValue` runtime function.

## Estimated Impact

### Texas Hold'em
- **Current**: 498 slow moves × ~13.5ms = 6710ms (79% of applyMove)
- **After Phase 3**: Interpreter dispatch eliminated for showdown evaluation.
  Conservative 5× speedup for the compiled chain → 6710ms → ~1340ms
- **Total applyMove**: 8500ms → ~3130ms (~63% reduction)
- **Total simulation**: 9688ms → ~4318ms (~55% reduction)

### FITL
- Lifecycle effects are more complex (coup resolution, support adjustment,
  capability activation) with deeper nesting.
- Estimated 3–5× speedup for compiled lifecycle paths.

### Evolution Pipeline (Spec 14)
- MAP-Elites fitness evaluation requires thousands of full game simulations.
- 55% simulation speedup directly translates to 2.2× more evaluations per
  wall-clock hour.

## Implementation Plan

| Phase | Effect Types | Estimated Effort | Impact |
|-------|-------------|------------------|--------|
| 1 | let, if, bindValue | Medium | Moderate — covers 85% of effect calls |
| 2 | forEach, reduce | Medium | High — covers iteration patterns |
| 3 | evaluateSubset | High | Very high — eliminates showdown bottleneck |
| 4 | Remaining leaf effects | Low | Moderate — eliminates all fallback |

Phases 1–2 can be delivered independently and provide incremental value.
Phase 3 is the highest-impact single phase but depends on 1–2.

## Risks

1. **Code generation complexity**: Generating correct JavaScript for all edge
   cases (error handling, budget enforcement, decision scope management) is
   non-trivial. **Mitigation**: Verification mode catches any divergence.

2. **Debugging difficulty**: Stack traces from compiled functions are less
   readable than interpreter dispatch. **Mitigation**: Source-map-style
   annotations in generated code linking back to effect AST paths.

3. **Compilation time**: Generating and `new Function()`-ing compiled code
   adds to `createGameDefRuntime` cost. **Mitigation**: Compilation is
   one-time per GameDef. For evolution pipelines, the GameDef is compiled
   once and reused across thousands of simulations.

4. **Maintenance burden**: Two execution paths (compiled + interpreted) must
   be kept in sync as new effect types are added. **Mitigation**: The
   interpreter remains the reference implementation. Compiled code is
   generated mechanically from the same AST structures.

## Testing Plan

1. **Parity tests**: For every lifecycle event in Texas Hold'em and FITL,
   assert compiled output == interpreted output (state, rng, events).
2. **Golden trace tests**: Existing golden traces must produce identical
   results with compiled effects enabled.
3. **Property tests**: Random-play 1000 games with verification mode enabled.
4. **Performance regression test**: Compiled path must be faster than or equal
   to interpreted path (never slower).
5. **Edge case tests**: Empty effect sequences, nested forEach, deeply nested
   let chains, evaluateSubset with 0 items, reduce over empty collection.
