# Spec 81 — Whole-Sequence Effect Compilation

**Status**: Draft
**Dependencies**: Spec 79 (Compiled Effect Path Redesign, completed), Spec 82
(Effect AST Type Tags, **required** — the `_k` discriminant enables
`switch`-based dispatch in the compiler, matching the proven `_t` pattern from
Spec 76)
**Builds On**: Spec 76 (ValueExpr `_t` tags), Spec 77 (EffectEnv/EffectCursor
split), Spec 78 (DraftTracker/MutableGameState), Spec 80 (Incremental Zobrist
Hashing)
**Enables**: Order-of-magnitude performance improvement for simulation-heavy
workloads (agent evolution, MAP-Elites fitness evaluation).

## Problem

The effect interpreter dispatches tens of thousands of individual effects per
game through a per-effect pipeline:

```
effectKindOf(effect) → consumeBudget → registry[kind](effect, env, cursor, budget, applyBatch) → normalizeResult
```

Even with the DraftTracker optimization from Spec 78 (eliminating ~25.7K
intermediate state spreads) and the EffectEnv/EffectCursor split from Spec 77
(reducing per-call context from 24 fields to 4-5), every effect still incurs:
kind extraction, budget consumption, registry lookup, handler invocation, and
result normalization. This overhead is multiplicative across tens of thousands
of effects per game.

More critically, phase-cascade moves (showdowns in Texas Hold'em, coup
resolutions in FITL) trigger deep effect chains — `evaluateSubset` runs the
full hand-ranking chain C(7,5) = 21 times per player per showdown, with each
chain containing ~15 effects (let, if, reduce, bindValue) — all through the
interpreter.

### What Spec 79 Achieved

Spec 79 restructured the compiled effect path and added pattern-based
compilation for 5 effect types:

- `setVar` — `compileSetVar`
- `addVar` — `compileAddVar`
- `if` — `compileIf` (with recursive body compilation)
- `forEach` (players-only variant) — `compileForEachPlayers`
- `gotoPhaseExact` — `compileGotoPhaseExact`

The current architecture in `effect-compiler-codegen.ts` produces
`CompiledEffectFragment` closures. The `compileFragmentList` function in
`effect-compiler.ts` classifies each effect via `classifyEffect`, compiles
recognized patterns, and wraps unrecognized effects in
`createFallbackFragment` which re-enters the interpreter via
`applyEffectsWithBudgetState`.

**Limitations:**

1. **Limited coverage**: Only 5 of 34 effect types are compiled. Control flow
   effects (let, forEach-general, reduce, evaluateSubset) and all token,
   marker, and information effects fall back to the interpreter.
2. **Fragment overhead**: The `composeFragments` loop iterates fragments, each
   with result destructuring and event collection. Fallback fragments re-enter
   the full interpreter pipeline.
3. **Net result**: Most lifecycle sequences have many fallback fragments,
   limiting the compiled path's impact.

### The V8 Optimization Wall

The performance campaign (14 experiments) proved that V8 micro-optimizations
cannot improve the interpreter further:
- Object allocation is ~5ns (V8 singleton/hidden-class optimized)
- `for-in` on single-key objects is optimal
- Mutable-cache patterns cause JIT deoptimization
- Control flow changes cause JIT deoptimization
- Template strings are ~0.04ns (V8 fast-path)

The only remaining lever is **eliminating the interpreter dispatch entirely**
by compiling whole effect sequences into closure-composed functions.

## Objective

Extend the effect compiler so that **every** lifecycle effect type has a
compiled closure generator. Once all 34 effect types are compilable, every
lifecycle effect sequence executes as composed closures with zero interpreter
fallback — a single JIT-optimizable call chain instead of thousands of
interpreter dispatches.

The compiled path uses the existing `CompiledEffectFn` signature:

```typescript
type CompiledEffectFn = (
  state: MutableGameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
) => EffectResult;
```

### Non-Goals

- **Compiling action effects**: Action effects involve pending-choice
  suspension (chooseOne, chooseN in player-facing contexts), which requires a
  fundamentally different compilation model. See the Forward-Looking section.
- **String codegen / `new Function()`**: The compiler uses closure composition
  exclusively. No CSP concerns, full TypeScript type safety, natural stack
  traces.

### End State (Foundation 9 Compliance)

Per Foundation 9 (No Backwards Compatibility), once all 34 effect types have
compiled closures:
1. `classifyEffect` returns a non-null pattern descriptor for every `_k` tag
2. `createFallbackFragment` is deleted
3. The `fallbackBatch` accumulation logic in `compileFragmentList` is deleted
4. Every `CompiledEffectSequence` has `coverageRatio: 1.0`
5. The interpreter remains only for: (a) action effects, (b) verification mode

No shim, no alias, no deprecated fallback path.

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: The compiler is generic — it compiles
  any game's effect ASTs, not game-specific logic. A poker hand evaluator and
  a COIN wargame resolution use the same compiler.
- **Foundation 5 (Determinism)**: Compiled functions must produce bit-identical
  results to the interpreter. The existing verification mode (dual execution +
  7-dimension parity check in `phase-lifecycle.ts`) is preserved and extended.
- **Foundation 6 (Bounded Computation)**: Compiled loops use the same bounds
  as interpreted loops — `queryResult.length` for forEach,
  `countCombinations(n, k)` cap for evaluateSubset, `repeat` count for
  explicit limits.
- **Foundation 7 (Immutability)**: Compiled functions use scoped internal
  mutation via `MutableGameState` and `DraftTracker` (Spec 78) within the
  `composeFragments` scope. The external contract `applyMove(state) →
  newState` is preserved; input state is never modified.
- **Foundation 8 (Compiler-Kernel Boundary)**: The CNL compiler transforms
  effect ASTs into GameDef. The effect compiler transforms GameDef effect ASTs
  into closure-composed functions. The kernel executes them. No boundary
  violation — the effect compiler is a kernel-internal optimization.
- **Foundation 9 (No Backwards Compatibility)**: Once all 34 types are
  compilable, the fallback path is removed entirely. No shim, no deprecated
  code. See End State above.
- **Foundation 11 (Testing)**: Exhaustive parity tests between compiled and
  interpreted paths for all effect types. Coverage ratio regression tests
  after each phase.
- **Foundation 12 (Branded Types)**: All `PhaseId`, `PlayerId`, `ZoneId`,
  `TokenId` values remain branded through compiled closures. Closures capture
  AST references at compile time; they do not extract or reconstruct branded
  values at runtime.

## Design

### 1. Closure Composition Model

The compiler already generates `CompiledEffectFragment` closures. This spec
extends the same pattern to all 34 effect types. Each compiled effect type
produces a closure that closes over AST references at compile time.

The key architectural change: instead of wrapping unrecognized effects in
`createFallbackFragment`, **every** effect type gets a pattern descriptor in
`effect-compiler-patterns.ts` and a compiled closure generator in
`effect-compiler-codegen.ts`. After Spec 82 adds `_k` tags, `classifyEffect`
uses `switch(effect._k)` for O(1) pattern matching.

#### Example: Compiling `let`

```typescript
// Input AST:
// { _k: EFFECT_KIND_TAG.LET, let: { bind: 'handRank', value: ..., in: [...] } }

// The compiler produces a closure that closes over the AST:
function compileLet(desc: LetPattern, compileBody: BodyCompiler): CompiledEffectFragment {
  const valueAccessor = compileValueAccessor(desc.value);
  const bodyFragment = compileBody(desc.inEffects);

  return {
    nodeCount: 1 + bodyFragment.nodeCount,
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'let');
      const resolvedValue = valueAccessor(state, bindings, ctx);
      const innerBindings = { ...bindings, [desc.bind]: resolvedValue };
      return bodyFragment.execute(state, rng, innerBindings, ctx);
    },
  };
}
```

The closure captures `desc.bind`, `valueAccessor`, and `bodyFragment` at
compile time. At execution time, there is no AST inspection, no registry
lookup, no kind extraction — just direct function calls.

#### Example: Compiling `forEach` (General)

```typescript
function compileForEach(desc: ForEachPattern, compileBody: BodyCompiler): CompiledEffectFragment {
  const bodyFragment = compileBody(desc.effects);

  return {
    nodeCount: 1 + bodyFragment.nodeCount,
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'forEach');
      const evalCtx = createEvalContext(ctx.def, state, bindings, ctx.adjacencyGraph);
      const items = evalQuery(desc.over, evalCtx);
      const limit = resolveControlFlowIterationLimit(items.length, desc.limit);
      let currentRng = rng;
      const emitted: TriggerEvent[] = [];

      for (let i = 0; i < limit; i++) {
        const innerBindings = { ...bindings, [desc.bind]: items[i] };
        const result = bodyFragment.execute(state, currentRng, innerBindings, ctx);
        currentRng = result.rng;
        if (result.emittedEvents) emitted.push(...result.emittedEvents);
        if (result.pendingChoice) {
          return { state, rng: currentRng, emittedEvents: emitted, pendingChoice: result.pendingChoice };
        }
      }
      return { state, rng: currentRng, emittedEvents: emitted };
    },
  };
}
```

### 2. Value Expression Compilation

`compileValueAccessor` already handles simple value expressions (literals,
binding references, gvar/pvar reads). Extend it to cover:

- **Arithmetic operations** (`_t: VALUE_EXPR_TAG.OP`): Compile `left` and
  `right` recursively, emit `leftAccessor(s,b,c) + rightAccessor(s,b,c)`.
- **Conditional values** (`_t: VALUE_EXPR_TAG.IF`): Compile condition +
  then/else branches.
- **Concat** (`_t: VALUE_EXPR_TAG.CONCAT`): Compile all parts, join at
  runtime.

Complex value expressions (aggregate, query-dependent) delegate to the
existing `evalValue` runtime function.

### 3. Condition Compilation

`matchCompilableCondition` currently handles comparison and logical (and/or)
conditions. Extend to cover:

- **`not`**: Negate inner compiled condition.
- **`exists`**: Token query evaluation (compile the query, check length > 0).
- **`hasTag`**: Zone/token tag lookup.
- **Aggregate-based**: Conditions wrapping aggregate value expressions.

### 4. Integration with GameDefRuntime

No structural change needed. Compiled effect functions are stored in
`GameDefRuntime.compiledLifecycleEffects` (keyed by `phaseId:lifecycle`). The
`dispatchLifecycleEvent` function in `phase-lifecycle.ts` checks for a
compiled function and calls it directly, falling back to `applyEffects` only
when no compiled function exists.

As more effect types become compilable, the coverage ratio increases
automatically. The transition from partial to full compilation is seamless.

### 5. Verification Mode

The existing verification harness in `phase-lifecycle.ts` already performs
dual execution with a 7-dimension parity check:

1. **State hash** (Zobrist via `computeFullHash`)
2. **RNG state** (`deepEqual`)
3. **Emitted events** (`deepEqual`)
4. **Pending choice** (must match or both undefined)
5. **Bindings** (when pending choice exists)
6. **Decision scope** (when pending choice exists)
7. **Warnings** (`deepEqual`)

Mismatches throw `CompiledEffectVerificationError` with phase, lifecycle,
coverage ratio, and mismatch kind. This harness requires no structural
changes — it automatically covers new effect types as they are compiled.

Verification mode should be enabled in CI with `verifyCompiledEffects: true`
in the execution policy, and property tests (random play for N turns) should
exercise it.

## Compilation Phases

All 34 effect types, grouped by complexity and dependency.

### Phase 0: Already Compiled (5 types) — Baseline

Already implemented in `effect-compiler-codegen.ts`:

| Effect | Compiler | Notes |
|--------|----------|-------|
| `setVar` | `compileSetVar` | Variable write with DraftTracker |
| `addVar` | `compileAddVar` | Variable delta with clamping |
| `if` | `compileIf` | Recursive body compilation |
| `forEach` (players) | `compileForEachPlayers` | Players-only variant |
| `gotoPhaseExact` | `compileGotoPhaseExact` | Phase transition |

No new work required. These serve as the pattern template.

### Phase 1: Simple Leaf Effects (11 types)

Effects that transform state without complex control flow. Each is a single
closure following established patterns.

**Variable/binding effects (3):**

| Effect | Complexity | Pattern |
|--------|-----------|---------|
| `bindValue` | Low | Add to bindings map, no state mutation |
| `transferVar` | Medium | Read two endpoints, compute transfer, write both (similar to `addVar` with two targets) |
| `let` | Medium | Bind value + recurse into body (similar to existing `if` pattern) |

**Marker effects (5):**

| Effect | Complexity | Pattern |
|--------|-----------|---------|
| `setMarker` | Medium | Resolve zone + marker, write via `ensureMarkerCloned` |
| `shiftMarker` | Medium | Like `setMarker` with delta arithmetic |
| `setGlobalMarker` | Low | Write to `state.globalMarkers` |
| `flipGlobalMarker` | Low | Conditional swap between two marker states |
| `shiftGlobalMarker` | Low | Delta on global marker value |

**Turn flow effects (3):**

| Effect | Complexity | Pattern |
|--------|-----------|---------|
| `setActivePlayer` | Low | Update `state.activePlayer` |
| `advancePhase` | Low | Thin wrapper around existing `applyAdvancePhase` |
| `popInterruptPhase` | Low | Pop from `state.interruptPhaseStack` |

### Phase 2: Token Effects (8 types)

Token operations require zone manipulation, DraftTracker coordination via
`ensureZoneCloned`, and potentially token query evaluation.

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `moveToken` | Medium | Resolve token, remove from source, add to target. `ensureZoneCloned` for both zones |
| `moveAll` | Medium | Like `moveToken` for all tokens matching an optional filter |
| `moveTokenAdjacent` | Medium | Target zone resolved via adjacency graph |
| `createToken` | Medium | Instantiate token, add to target zone |
| `destroyToken` | Medium | Resolve token, remove from its zone |
| `setTokenProp` | Medium | Resolve token, create modified copy with new prop value |
| `draw` | Medium | Move `count` tokens from source to target. Bounded loop |
| `shuffle` | Medium | Randomize token order in a zone. Consumes RNG |

### Phase 3: Iteration & Reduction (3 types)

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `forEach` (general) | Medium-High | Extend `compileForEachPlayers` to handle ALL `OptionsQuery` types (tokens, zones, etc.), not just players |
| `reduce` | Medium-High | Accumulator pattern over query result. Closure captures initial value, next expression, and body |
| `removeByPriority` | High | Budget-based removal across priority groups. Most complex non-choice control flow effect |

### Phase 4: Information Effects (2 types)

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `reveal` | Medium | Modify `state.reveals` map with filtering logic |
| `conceal` | Medium | Inverse of `reveal` |

### Phase 5: Complex Control Flow & Evaluation (3 types)

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `evaluateSubset` | High | C(n,k) combination enumeration with inner effect evaluation and score comparison. Highest-impact single compilation target for Texas Hold'em |
| `rollRandom` | Medium | Consume RNG, bind result, execute inner effects. In lifecycle contexts, always deterministic (no player suspension) |
| `pushInterruptPhase` | Medium | Push to interrupt stack with state manipulation |

### Phase 6: Lifecycle-Only Choice Effects (2 types)

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `chooseOne` | Medium | In lifecycle effects, always bot-resolved (no human player). Compiled closure invokes decision-resolution pipeline directly. If `pendingChoice` returned, fragment propagates it |
| `chooseN` | Medium | Same pattern as `chooseOne` |

`grantFreeOperation` primarily appears in action effects. If encountered in
lifecycle effects, it can be compiled as a thin wrapper calling the existing
interpreter handler initially, then refined.

### Cleanup Phase

Once all 34 types have compiled closures:

1. Assert `classifyEffect` is exhaustive (non-null for every `_k` tag)
2. Delete `createFallbackFragment`
3. Delete `fallbackBatch` accumulation in `compileFragmentList`
4. Add CI assertion: `coverageRatio === 1.0` for all lifecycle sequences
5. Update `composeFragments` to remove fallback-related branching

### Phase Dependencies

```
Phase 0 (done) ─┬─ Phase 1 (independent)
                 ├─ Phase 2 (independent)
                 ├─ Phase 4 (independent)
                 └─ Phase 6 (independent after Phase 1)
Phase 1 + 2 ────── Phase 3 (forEach-general may iterate tokens)
Phase 1 + 2 + 3 ── Phase 5 (evaluateSubset body contains nested effects)
All phases ──────── Cleanup
```

Phases 1, 2, and 4 can be parallelized.

## Fallback Strategy (During Transition)

The existing fragment architecture naturally supports incremental coverage
expansion. During phased implementation:

- `compileFragmentList` classifies each effect. Compilable effects produce
  closures; uncompilable effects are wrapped in `createFallbackFragment`.
- `composeFragments` chains all fragments (compiled + fallback) and threads
  state through them.
- `computeCoverageRatio` tracks what percentage of effect nodes are compiled.

This transitional strategy requires no new architecture. As each phase lands,
coverage increases and fallback fragments decrease. The cleanup phase removes
the fallback infrastructure entirely.

## Forward-Looking: Action Effect Compilation

Action effects contain `chooseOne` and `chooseN` effects that require
**player-facing suspension**. When a human player needs to make a choice, the
effect execution must suspend (return a `pendingChoice` in `EffectResult`),
serialize enough context to resume later, and restart from the suspension
point when the choice is resolved.

The current fragment architecture already handles this: `composeFragments`
checks for `pendingChoice` after each fragment and returns early if one is
found. However, whole-sequence compilation of action effects would require:

1. **Continuation capture**: Saving the compiled function's position (which
   closure in the chain, which loop iteration) so execution can resume after
   the choice is resolved.
2. **State serialization**: The `MutableGameState`, `DraftTracker`,
   accumulated bindings, and decision scope must all be serializable across
   the suspension boundary.
3. **Re-entry**: The compiled function must support being called with a
   partially-completed state to resume from the suspension point.

This is fundamentally different from lifecycle effects, where execution is
always straight-through (no human-player choices). Lifecycle effects may
contain `chooseOne`/`chooseN` for bot decisions, but these are resolved
immediately within the same execution scope.

Action effect compilation is deferred to a future spec. The architectural
approach would likely involve a CPS (continuation-passing style)
transformation of the closure chain, or a coroutine-based model.

## Estimated Impact

> **Note**: The performance baseline has changed significantly since Specs
> 76-80. ValueExpr dispatch is 3.27x faster (Spec 76), context spreading is
> reduced (Spec 77), state transitions use copy-on-write DraftTracker (Spec
> 78), and Zobrist hashing is incremental (Spec 80). The estimates below are
> qualitative.

- **Phase 1-2 (simple leaves + tokens)**: Moderate impact. Eliminates
  fallback-fragment re-entry overhead for the most common leaf effects.
  Removes interpreter dispatch pipeline (kind extraction, registry lookup,
  handler invocation) for compiled effects.
- **Phase 3 (iteration)**: High impact. General `forEach` and `reduce` are
  heavily used in both FITL and Texas Hold'em lifecycle effects. Compiling
  these eliminates per-iteration interpreter re-entry.
- **Phase 5 (evaluateSubset)**: Very high impact for Texas Hold'em. The
  `evaluateSubset` effect runs the full hand-ranking chain C(7,5) = 21 times
  per player per showdown. Compiling this into a single closure eliminates
  ~15 interpreter dispatches per combination, multiplied across all
  showdowns.
- **Overall**: Eliminating ALL interpreter dispatch for lifecycle effects
  should yield a significant speedup (estimated 3-10x depending on the
  game's lifecycle complexity), compounding with gains from Specs 76-80.
- **Evolution pipeline (Spec 14)**: Simulation speedup directly multiplies
  MAP-Elites evaluation throughput.

## Beneficial Additions

### AST Shape Census Tool

A development-time utility that walks all lifecycle effects in a GameDef and
reports:
- Which effect types appear and how frequently
- Whether each is currently compilable
- Which patterns are used (for guiding implementation priority)

This guides phase prioritization and catches missed patterns before CI.

### Condition Compilation Extension

Extend `matchCompilableCondition` beyond comparisons and logical (and/or) to
cover:
- `not` — negate inner compiled condition
- `exists` — token query evaluation (compile query, check length > 0)
- `hasTag` — zone/token tag lookup
- Aggregate-based conditions

This increases coverage ratio for `if` effects that currently fall back due
to uncompilable conditions.

### Coverage Ratio Regression Tests

After each phase, assert minimum coverage floor for all lifecycle effects in
both FITL and Texas Hold'em GameDefs:

| After Phase | Expected Coverage Floor |
|-------------|------------------------|
| 1 | >= 40% |
| 2 | >= 60% |
| 3 | >= 80% |
| 5 | >= 95% |
| 6 | 100% |

### Fragment Fusion (Micro-Optimization)

Before the cleanup phase, consider a fusion pass that merges adjacent compiled
fragments into a single closure, eliminating per-fragment result
normalization overhead in `composeFragments`. This is a micro-optimization
that aligns with the goal of single-function execution.

## Risks

1. **Closure correctness complexity**: Generating correct closures for all
   edge cases (error handling, budget enforcement, decision scope management,
   DraftTracker coordination) is non-trivial. **Mitigation**: The existing
   verification mode catches any divergence immediately. Per-effect-type unit
   tests compare compiled vs. interpreted output for representative AST
   shapes.

2. **Pattern matching completeness**: `classifyEffect` must produce a pattern
   descriptor for every combination of AST features used in production games.
   Complex effects like `grantFreeOperation` have many optional fields that
   all need coverage. **Mitigation**: The AST Shape Census Tool (see
   Beneficial Additions) compiles a census of actually-used AST shapes from
   FITL and Texas Hold'em GameDefs to guide pattern implementation.

3. **Maintenance burden**: Two execution paths (compiled + interpreted) must
   be kept in sync during the transition. **Mitigation**: Per Foundation 9,
   this dual-path is temporary. Once all 34 types are compiled, the fallback
   is deleted. During the transition, the verification mode in CI catches
   divergence immediately.

4. **Closure construction cost**: Building composed closures adds to
   `createGameDefRuntime` cost. **Mitigation**: Closure construction is
   lightweight (no string parsing, no eval). Cost is proportional to AST node
   count and is one-time per GameDef. For evolution pipelines, the GameDef is
   compiled once and reused across thousands of simulations.

## Testing Plan

1. **Per-effect-type unit tests**: Each new pattern descriptor (Phases 1-6)
   gets dedicated tests comparing compiled vs. interpreted output for
   representative AST shapes. Tests use `compilePatternDescriptor` directly,
   not the full lifecycle pipeline.
2. **Parity tests**: For every lifecycle event in Texas Hold'em and FITL,
   assert compiled output == interpreted output (state, rng, events) via the
   7-dimension verification harness.
3. **Golden trace tests**: Existing golden traces must produce identical
   results with compiled effects enabled.
4. **Property tests**: Random-play 1000 games with `verifyCompiledEffects:
   true`. Any divergence fails the test.
5. **Coverage ratio regression tests**: After each phase, assert minimum
   coverage floor (see Beneficial Additions table). Final gate: assert
   `coverageRatio === 1.0` for all lifecycle effect sequences.
6. **Performance regression test**: Compiled path must be faster than or
   equal to interpreted path (never slower).
7. **Edge case tests**: Empty effect sequences, nested forEach, deeply nested
   let chains, evaluateSubset with 0 items, reduce over empty collection,
   marker effects on non-existent markers, token effects on empty zones.
