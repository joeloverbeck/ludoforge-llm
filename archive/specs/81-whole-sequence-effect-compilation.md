# Spec 81 — Whole-Sequence Effect Compilation

**Status**: COMPLETED
**Dependencies**: Spec 79 (Compiled Effect Path Redesign, completed), Spec 82
(Effect AST Type Tags, **completed** — the `_k` discriminant enables
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

1. **Limited coverage**: Only 5 of 33 compilable lifecycle effect types are
   compiled. Control flow effects (let, forEach-general, reduce,
   evaluateSubset) and all token, marker, and information effects fall back to
   the interpreter.
2. **Fragment overhead**: The `composeFragments` loop iterates fragments, each
   with result destructuring and event collection. Fallback fragments re-enter
   the full interpreter pipeline.
3. **Net result**: Most lifecycle sequences have many fallback fragments,
   limiting the compiled path's impact.
4. **Linear classification**: `classifyEffect` chains `matchSetVar(node) ??
   matchAddVar(node) ?? ...` — a linear probe. With Spec 82's `_k` tags,
   this can become O(1) `switch` dispatch.

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
compiled closure generator. Once all 33 lifecycle effect types are compilable,
every lifecycle effect sequence executes as composed closures with zero
interpreter fallback — a single JIT-optimizable call chain instead of
thousands of interpreter dispatches.

The compiled path uses the existing `CompiledEffectFn` signature:

```typescript
type CompiledEffectFn = (
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
) => EffectResult;
```

Note: Individual fragment closures receive `GameState`. The `MutableGameState`
and `DraftTracker` are created at the `composeFragments` boundary and threaded
to fragments via `ctx.tracker`. Fragments that mutate state do so through the
tracker's copy-on-write helpers (`ensureZoneCloned`, `ensureMarkerCloned`,
etc.) operating on the underlying mutable state.

### Non-Goals

- **Compiling action effects**: Action effects involve pending-choice
  suspension (chooseOne, chooseN in player-facing contexts), which requires a
  fundamentally different compilation model. See the Forward-Looking section.
- **Compiling `grantFreeOperation` (tag 22)**: This effect is
  action-context-heavy, depending on `__freeOperation` and `__actionClass`
  bindings that are only available during the operation pipeline. It has
  extreme complexity (contract DSL enforcement, viability probes, sequence
  context tracking, seat resolution). Deferred alongside action effect
  compilation to a future spec.
- **String codegen / `new Function()`**: The compiler uses closure composition
  exclusively. No CSP concerns, full TypeScript type safety, natural stack
  traces.

### End State (Foundation 9 Compliance)

Per Foundation 9 (No Backwards Compatibility), once all 33 lifecycle effect
types have compiled closures:
1. `classifyEffect` returns a non-null pattern descriptor for every `_k` tag
   except `EFFECT_KIND_TAG.grantFreeOperation` (tag 22)
2. `createFallbackFragment` is deleted
3. The `fallbackBatch` accumulation logic in `compileFragmentList` is deleted
4. Every `CompiledEffectSequence` has `coverageRatio: 1.0`
5. The interpreter remains only for: (a) action effects (including
   `grantFreeOperation`), (b) verification mode
6. A runtime assertion verifies `grantFreeOperation` is never encountered in
   lifecycle effect sequences

No shim, no alias, no deprecated fallback path.

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: The compiler is generic — it compiles
  any game's effect ASTs, not game-specific logic. A poker hand evaluator and
  a COIN wargame resolution use the same compiler.
- **Foundation 5 (Determinism)**: Compiled functions must produce bit-identical
  results to the interpreter, including identical trace events and binding
  snapshots. The existing verification mode (dual execution + 7-dimension
  parity check in `phase-lifecycle.ts`) is preserved and extended.
- **Foundation 6 (Bounded Computation)**: Compiled loops use the same bounds
  as interpreted loops — `queryResult.length` for forEach,
  `countCombinations(n, k)` cap for evaluateSubset, `repeat` count for
  explicit limits.
- **Foundation 7 (Immutability)**: `composeFragments` creates a
  `MutableGameState` (shallow clone) and `DraftTracker` at scope entry. These
  are threaded to individual fragments via `ctx.tracker`. Fragment closures
  receive `GameState` (the mutable state seen through its immutable type) and
  use tracker helpers (`ensureZoneCloned`, `ensureMarkerCloned`, etc.) for
  copy-on-write mutations. The external contract `applyMove(state) → newState`
  is preserved; input state is never modified.
- **Foundation 8 (Compiler-Kernel Boundary)**: The CNL compiler transforms
  effect ASTs into GameDef. The effect compiler transforms GameDef effect ASTs
  into closure-composed functions. The kernel executes them. No boundary
  violation — the effect compiler is a kernel-internal optimization.
- **Foundation 9 (No Backwards Compatibility)**: Once all 33 lifecycle types
  are compilable, the fallback path is removed entirely. No shim, no
  deprecated code. See End State above.
- **Foundation 11 (Testing)**: Exhaustive parity tests between compiled and
  interpreted paths for all effect types, including trace event parity.
  Coverage ratio regression tests after each phase.
- **Foundation 12 (Branded Types)**: All `PhaseId`, `PlayerId`, `ZoneId`,
  `TokenId` values remain branded through compiled closures. Closures capture
  AST references at compile time; they do not extract or reconstruct branded
  values at runtime.

## Design

### 1. Closure Composition Model

The compiler already generates `CompiledEffectFragment` closures. This spec
extends the same pattern to all 33 lifecycle effect types. Each compiled
effect type produces a closure that closes over AST references at compile
time.

The key architectural change: instead of wrapping unrecognized effects in
`createFallbackFragment`, **every** lifecycle effect type gets a pattern
descriptor in `effect-compiler-patterns.ts` and a compiled closure generator
in `effect-compiler-codegen.ts`. With Spec 82's `_k` tags, `classifyEffect`
uses `switch(effect._k)` for O(1) pattern matching.

#### Example: Compiling `let`

```typescript
// Input AST:
// { _k: EFFECT_KIND_TAG.let, let: { bind: 'handRank', value: ..., in: [...] } }

function compileLet(desc: LetPattern, compileBody: BodyCompiler): CompiledEffectFragment {
  const valueAccessor = compileValueAccessor(desc.value);
  const bodyFragment = compileBody(desc.inEffects);

  return {
    nodeCount: 1 + bodyFragment.nodeCount,
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'let');
      const resolvedValue = valueAccessor(state, bindings, ctx);
      const innerBindings = { ...bindings, [desc.bind]: resolvedValue };
      const bodyResult = bodyFragment.execute(state, rng, innerBindings, ctx);

      // Short-circuit on pending choice (propagate without binding export)
      if (bodyResult.pendingChoice !== undefined) {
        return { ...bodyResult, bindings };
      }

      // Binding export: only $-prefixed bindings, excluding own bind name
      // (mirrors applyLet in effects-control.ts lines 122-128)
      const nestedBindings = bodyResult.bindings ?? innerBindings;
      const exportedBindings: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(nestedBindings)) {
        if (name === desc.bind || !name.startsWith('$')) continue;
        exportedBindings[name] = value;
      }

      return {
        state: bodyResult.state,
        rng: bodyResult.rng,
        ...(bodyResult.emittedEvents ? { emittedEvents: bodyResult.emittedEvents } : {}),
        ...(bodyResult.decisionScope ? { decisionScope: bodyResult.decisionScope } : {}),
        bindings: { ...bindings, ...exportedBindings },
      };
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
  const continuationFragment = desc.inEffects ? compileBody(desc.inEffects) : null;

  return {
    nodeCount: 1 + bodyFragment.nodeCount + (continuationFragment?.nodeCount ?? 0),
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'forEach');
      const evalCtx = createEvalContext(ctx.def, state, bindings, ctx.adjacencyGraph);
      const items = evalQuery(desc.over, evalCtx);
      const limit = resolveControlFlowIterationLimit('forEach', desc.limit, evalCtx);
      let currentRng = rng;
      const emitted: TriggerEvent[] = [];
      let currentDecisionScope = ctx.decisionScope;

      // Trace emission (mirrors applyForEach in effects-control.ts)
      if (ctx.traceContext) {
        emitTrace(ctx.resources.collector, buildForEachTraceEntry({
          bind: desc.bind, matchCount: items.length, iteratedCount: limit,
          limit: desc.limit, /* ... provenance fields ... */
        }));
      }

      // Save parent iteration path for restoration after loop
      const parentIterationPath = currentDecisionScope?.iterationPath;

      for (let i = 0; i < limit; i++) {
        // Decision scope rebasing per iteration
        const iterScope = currentDecisionScope
          ? withIterationSegment(currentDecisionScope, i)
          : currentDecisionScope;

        const innerBindings = { ...bindings, [desc.bind]: items[i] };
        const result = bodyFragment.execute(state, currentRng, innerBindings, {
          ...ctx, decisionScope: iterScope,
        });
        currentRng = result.rng;
        if (result.emittedEvents) emitted.push(...result.emittedEvents);
        if (result.decisionScope) currentDecisionScope = result.decisionScope;
        if (result.pendingChoice) {
          return { state, rng: currentRng, emittedEvents: emitted,
                   pendingChoice: result.pendingChoice, decisionScope: currentDecisionScope };
        }
      }

      // Restore parent iteration path
      if (parentIterationPath !== undefined && currentDecisionScope) {
        currentDecisionScope = rebaseIterationPath(currentDecisionScope, parentIterationPath);
      }

      // Optional countBind + continuation block
      if (continuationFragment && desc.countBind) {
        const contBindings = { ...bindings, [desc.countBind]: limit };
        const contResult = continuationFragment.execute(state, currentRng, contBindings, {
          ...ctx, decisionScope: currentDecisionScope,
        });
        // ... merge contResult events, handle pendingChoice ...
        return contResult;
      }

      return { state, rng: currentRng, emittedEvents: emitted,
               decisionScope: currentDecisionScope };
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

### 6. Trace Emission Parity

Compiled closures MUST emit identical structured trace events to the
interpreter for full verification parity. The interpreter records traces via
`emitTrace()` in `execution-collector.ts`, gated on
`env.collector.trace !== null`.

In compiled closures, trace emission is gated on `ctx.traceContext` (or
`ctx.resources.collector.trace !== null`). Each compiled effect handler must
replicate the trace entries from its interpreter counterpart:

- **forEach**: `buildForEachTraceEntry` (bind, matchCount, iteratedCount,
  limit, provenance) — in `control-flow-trace.ts`
- **reduce**: `buildReduceTraceEntry` (itemBind, accBind, resultBind,
  matchCount, iteratedCount, limit, provenance)
- **let**: Trace entry for binding value via `withCursorTrace`
- **Token effects**: `resolveTraceProvenance` entries in `effects-token.ts`
- **Var effects**: `emitVarChangeTraceIfChanged` / `emitVarChangeArtifacts`
  in `var-change-trace.ts`
- **Marker effects**: Trace entries in `effects-choice.ts`
- **Reveal/conceal**: Trace entries in `effects-reveal.ts`

Without trace parity, the 7-dimension verification check (dimension 3:
emittedEvents) will fail. This adds implementation complexity to each closure
but is non-negotiable during the transition period.

### 7. Decision Scope Management

`forEach`, `reduce`, and `evaluateSubset` all rebase
`decisionScope.iterationPath` for each iteration using
`withIterationSegment(scope, index)` from `decision-scope.ts`. Compiled
closures must replicate this:

- **forEach**: Save `parentIterationPath` before the loop. On each iteration,
  call `withIterationSegment(currentDecisionScope, i)` before executing the
  body. After the loop, restore via
  `rebaseIterationPath(currentDecisionScope, parentIterationPath)`.
- **reduce**: Same rebasing pattern per iteration item.
- **evaluateSubset**: Per-combination rebasing.

The existing `compileForEachPlayers` in `effect-compiler-codegen.ts` already
implements this pattern. General forEach, reduce, and evaluateSubset closures
must follow the same approach.

### 8. Binding Export Semantics

`let` and `reduce` have specific binding export rules that compiled closures
must replicate exactly:

- **`let`**: After executing the body, exports ONLY `$`-prefixed bindings
  created within the scope, EXCLUDING the let's own bind name. Non-`$`
  bindings are filtered out. See `applyLet` in `effects-control.ts` lines
  122-128.
- **`reduce`**: After executing the continuation (`in` block), exports ONLY
  `$`-prefixed bindings, EXCLUDING the `resultBind` name. Same filtering
  pattern as `let`. See `applyReduce` in `effects-control.ts` lines 325-331.
- **`evaluateSubset`**: Exports `bestBind` (best subset) and optional
  `bestScoreBind` (best score) after finding the optimal subset. See
  `applyEvaluateSubset` in `effects-subset.ts`.

Getting these wrong causes subtle state corruption in downstream effects.
The `compileLet` example above shows the correct filtering logic.

### 9. Token State Index Invalidation

All token effects (`moveToken`, `moveAll`, `moveTokenAdjacent`, `draw`,
`shuffle`, `createToken`, `destroyToken`, `setTokenProp`) call
`invalidateTokenStateIndex(state)` after modifying zones. Compiled closures
for token effects MUST do the same. The function is in
`token-state-index.ts`.

The token state index caches zone-to-token lookups; stale caches produce
wrong results for subsequent queries within the same effect sequence.

### 10. Incremental Zobrist Hash Updates

Marker effects (`setMarker`, `shiftMarker`, `setGlobalMarker`,
`flipGlobalMarker`, `shiftGlobalMarker`) and variable effects (`setVar`,
`addVar`, `setActivePlayer`) update the running Zobrist hash via
`updateRunningHash` / `updateVarRunningHash` from `zobrist.ts` /
`zobrist-var-hash.ts`.

Compiled closures must replicate these hash updates. The Zobrist table is
accessed via `ctx.cachedRuntime?.zobristTable`. When the table is present, the
old feature must be XOR'd out and the new feature XOR'd in.

The `DraftTracker` handles zone-level token hashing automatically, but marker
and variable hash updates are explicit in the handler code and must be
replicated in compiled closures.

## Compilation Phases

All 33 lifecycle effect types (excluding `grantFreeOperation`), grouped by
complexity and dependency.

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

### Phase 0.5: classifyEffect Switch Dispatch

Rewrite `classifyEffect` in `effect-compiler-patterns.ts` from the current
chain-of-`??` matchers to `switch(effect._k)` dispatch. This is the
foundational change that Spec 82 enables and must land before any new pattern
descriptors are added.

Deliverables:

1. `classifyEffect` uses `switch(effect._k)` with O(1) dispatch via
   `EFFECT_KIND_TAG` constants
2. `PatternDescriptor` union type extended with placeholder stubs for all
   lifecycle tags (returning null for not-yet-compiled types)
3. `walkEffects` uses `_k` for structural traversal (consistency)
4. `grantFreeOperation` branch throws or returns null with a comment
   documenting deferral
5. All existing tests pass (behavior-preserving refactor)

### Phase 1: Simple Leaf Effects (11 types)

Effects that transform state without complex control flow. Each is a single
closure following established patterns.

**Variable/binding effects (3):**

| Effect | Complexity | Pattern |
|--------|-----------|---------|
| `bindValue` | Low | Add to bindings map, no state mutation |
| `transferVar` | Medium | Read two endpoints, compute transfer, write both (similar to `addVar` with two targets). Zobrist hash update required |
| `let` | Medium-High | Bind value + recurse into body. Requires binding export filtering (`$`-prefix only, exclude own bind) and trace emission |

**Marker effects (5):**

| Effect | Complexity | Pattern |
|--------|-----------|---------|
| `setMarker` | Medium | Resolve zone + marker, write via `ensureMarkerCloned`. Zobrist hash update required |
| `shiftMarker` | Medium | Like `setMarker` with delta arithmetic. Zobrist hash update required |
| `setGlobalMarker` | Low | Write to `state.globalMarkers`. Zobrist hash update required |
| `flipGlobalMarker` | Low | Conditional swap between two marker states. Zobrist hash update required |
| `shiftGlobalMarker` | Low | Delta on global marker value. Zobrist hash update required |

**Turn flow effects (3):**

| Effect | Complexity | Pattern |
|--------|-----------|---------|
| `setActivePlayer` | Low | Update `state.activePlayer`. Zobrist hash update required |
| `advancePhase` | Medium | Wrapper around existing `applyAdvancePhase` logic, involves lifecycle dispatch |
| `popInterruptPhase` | Medium | Pop from `state.interruptPhaseStack`, lifecycle dispatch, usage reset |

### Phase 2: Token Effects (8 types)

Token operations require zone manipulation, DraftTracker coordination via
`ensureZoneCloned`, and potentially token query evaluation. All token effects
must call `invalidateTokenStateIndex(state)` after zone mutations.

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `moveToken` | Medium | Resolve token, remove from source, add to target. `ensureZoneCloned` for both zones. Stacking enforcement |
| `moveAll` | Medium | Like `moveToken` for all tokens matching an optional filter |
| `moveTokenAdjacent` | Medium | Target zone resolved via adjacency graph |
| `createToken` | Medium | Instantiate token, add to target zone. Stacking enforcement |
| `destroyToken` | Medium | Resolve token, remove from its zone |
| `setTokenProp` | Low | Resolve token, create modified copy with new prop value |
| `draw` | Medium | Move `count` tokens from source to target. Bounded loop |
| `shuffle` | Low | Randomize token order in a zone. Consumes RNG |

### Phase 3: Iteration & Reduction (3 types)

These effects require decision scope rebasing, trace emission, and (for
`reduce`) binding export filtering.

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `forEach` (general) | High | Extend `compileForEachPlayers` to handle ALL `OptionsQuery` types (tokens, zones, etc.), not just players. Decision scope rebasing, trace emission (`buildForEachTraceEntry`), `countBind`/`in` continuation support |
| `reduce` | High | Accumulator pattern over query result. Closure captures initial value, next expression, and continuation. Decision scope rebasing, trace emission (`buildReduceTraceEntry`), binding export filtering (`$`-prefix only) |
| `removeByPriority` | Very High | Budget-based removal across priority groups. Synthesizes moveToken effects per item. Per-group query scope refresh, countBind per group, remainingBind export |

### Phase 4: Information Effects (2 types)

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `reveal` | Medium | Modify `state.reveals` map with filtering logic. Trace emission |
| `conceal` | Medium | Inverse of `reveal`. Trace emission |

### Phase 5: Complex Control Flow & Evaluation (3 types)

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `evaluateSubset` | Extreme | C(n,k) combination enumeration (capped at 10K) with inner effect evaluation and score comparison. Highest-impact single compilation target for Texas Hold'em. Decision scope rebasing per combination, binding export (bestBind, bestScoreBind) |
| `rollRandom` | Medium | Consume RNG, bind result, execute inner effects. In lifecycle contexts, always deterministic (no player suspension) |
| `pushInterruptPhase` | Medium | Push to interrupt stack with state manipulation |

### Phase 6: Lifecycle-Only Choice Effects (2 types)

| Effect | Complexity | Notes |
|--------|-----------|-------|
| `chooseOne` | High | In lifecycle effects, always bot-resolved (no human player). Compiled closure invokes decision-resolution pipeline directly. If `pendingChoice` returned, fragment propagates it. Complex option template resolution and prioritized tier queries |
| `chooseN` | High | Same pattern as `chooseOne` with multi-choice cardinality and qualifier mapping |

### Cleanup Phase

Once all 33 lifecycle types have compiled closures:

1. Assert `classifyEffect` returns non-null for every `_k` tag except
   `EFFECT_KIND_TAG.grantFreeOperation` (tag 22)
2. Delete `createFallbackFragment`
3. Delete `fallbackBatch` accumulation in `compileFragmentList`
4. Add CI assertion: `coverageRatio === 1.0` for all lifecycle sequences
5. Update `composeFragments` to remove fallback-related branching
6. Add runtime assertion that `grantFreeOperation` is never encountered in
   lifecycle effect sequences

### Phase Dependencies

```
Phase 0.5 ──────── prerequisite for all subsequent phases
Phase 0 (done) + Phase 0.5 ─┬─ Phase 1 (independent)
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

`grantFreeOperation` (tag 22) is also deferred to this future spec, as it is
action-context-heavy and depends on operation pipeline bindings
(`__freeOperation`, `__actionClass`) not available in lifecycle contexts.

Action effect compilation is deferred to a future spec. The architectural
approach would likely involve a CPS (continuation-passing style)
transformation of the closure chain, or a coroutine-based model.

## Estimated Impact

> **Note**: The performance baseline has changed significantly since Specs
> 76-80. ValueExpr dispatch is 3.27x faster (Spec 76), context spreading is
> reduced (Spec 77), state transitions use copy-on-write DraftTracker (Spec
> 78), and Zobrist hashing is incremental (Spec 80). The estimates below are
> qualitative.

- **Phase 0.5 (classifyEffect rewrite)**: Negligible direct performance
  impact but enables O(1) pattern classification for all subsequent phases.
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
| 0.5 | >= 15% (same as Phase 0, structural refactor only) |
| 1 | >= 40% |
| 2 | >= 60% |
| 3 | >= 80% |
| 5 | >= 95% |
| 6 | 100% |

## Risks

1. **Closure correctness complexity**: Generating correct closures for all
   edge cases (error handling, budget enforcement, decision scope management,
   DraftTracker coordination, trace emission, binding export filtering) is
   non-trivial. **Mitigation**: The existing verification mode catches any
   divergence immediately. Per-effect-type unit tests compare compiled vs.
   interpreted output for representative AST shapes.

2. **Pattern matching completeness**: `classifyEffect` must produce a pattern
   descriptor for every combination of AST features used in production games.
   Complex effects like `evaluateSubset` and `removeByPriority` have many
   optional fields and nested bodies requiring exhaustive coverage.
   **Mitigation**: `computeCoverageRatio` tracks per-sequence compilation
   coverage. Phase groupings by complexity tier (Phases 1-6) ensure
   systematic coverage. Verification mode in CI catches any unhandled AST
   shapes immediately.

3. **Maintenance burden**: Two execution paths (compiled + interpreted) must
   be kept in sync during the transition. **Mitigation**: Per Foundation 9,
   this dual-path is temporary. Once all 33 lifecycle types are compiled, the
   fallback is deleted. During the transition, the verification mode in CI
   catches divergence immediately.

4. **Closure construction cost**: Building composed closures adds to
   `createGameDefRuntime` cost. **Mitigation**: Closure construction is
   lightweight (no string parsing, no eval). Cost is proportional to AST node
   count and is one-time per GameDef. For evolution pipelines, the GameDef is
   compiled once and reused across thousands of simulations.

5. **Trace emission fidelity**: Every compiled closure must replicate the
   exact trace entries from its interpreter counterpart. Missing or different
   trace entries cause verification dimension 3 (emittedEvents) to fail.
   Trace emission uses different infrastructure in compiled closures
   (accessing `ctx.resources.collector` rather than `env.collector`), which
   requires careful mapping. **Mitigation**: Per-effect-type parity tests
   that assert identical trace arrays. The verification harness catches any
   divergence in CI.

6. **Binding export correctness**: `let` and `reduce` have non-obvious
   binding export rules (`$`-prefixed bindings only, excluding own bind
   names). Getting this wrong causes subtle state corruption in downstream
   effects. **Mitigation**: Dedicated unit tests comparing compiled vs.
   interpreted binding snapshots for nested let/reduce chains.

## Testing Plan

1. **Per-effect-type unit tests**: Each new pattern descriptor (Phases
   0.5-6) gets dedicated tests comparing compiled vs. interpreted output for
   representative AST shapes. Tests use `compilePatternDescriptor` directly,
   not the full lifecycle pipeline.
2. **Parity tests**: For every lifecycle event in Texas Hold'em and FITL,
   assert compiled output == interpreted output (state, rng, events) via the
   7-dimension verification harness.
3. **Trace parity tests**: For each compiled effect type, assert that compiled
   execution produces identical trace entries (effectTrace and conditionTrace
   arrays) to interpreted execution. These test individual effect handlers in
   isolation, separate from the full lifecycle parity tests in item 2.
4. **Golden trace tests**: Existing golden traces must produce identical
   results with compiled effects enabled.
5. **Property tests**: Random-play 1000 games with `verifyCompiledEffects:
   true`. Any divergence fails the test.
6. **Coverage ratio regression tests**: After each phase, assert minimum
   coverage floor (see Beneficial Additions table). Final gate: assert
   `coverageRatio === 1.0` for all lifecycle effect sequences.
7. **Performance regression test**: Compiled path must be faster than or
   equal to interpreted path (never slower).
8. **Binding export tests**: Verify that `let` and `reduce` compiled closures
   export exactly the same bindings as interpreted counterparts: only
   `$`-prefixed bindings, excluding own bind names. Test with nested
   let-in-let, reduce-in-let, and mixed chains.
9. **Edge case tests**: Empty effect sequences, nested forEach, deeply nested
   let chains, evaluateSubset with 0 items, reduce over empty collection,
   marker effects on non-existent markers, token effects on empty zones.

## Outcome

- Completion date: 2026-03-25
- What actually changed:
  - lifecycle effect compilation reached full coverage with `coverageRatio === 1.0` enforced for compiled lifecycle sequences
  - interpreter fallback batching for lifecycle compilation was removed, leaving compiled lifecycle execution as the current architecture
  - compiled lifecycle parity/verification coverage was expanded across unit and integration tests, including control flow, token, marker, reveal/conceal, and lifecycle runtime boundaries
  - compiled execution context contracts were tightened in follow-up work so compiled fragments run with explicit execution invariants rather than scattered local repairs
- Deviations from original plan:
  - `grantFreeOperation` remains outside lifecycle compilation, consistent with the spec’s non-goals
  - the final context architecture kept explicit `mode` and `decisionAuthority` at the compiled boundary because kernel architecture guards forbid implicit execution-mode fallback semantics
  - some completion work landed through the archived `81WHOSEQEFFCOM-*` tickets rather than as a single monolithic implementation step
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
