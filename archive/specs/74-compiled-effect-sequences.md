# Spec 74 — Compiled Effect Sequences

**Status**: ✅ COMPLETED

## Problem

The kernel's effect AST interpreter is the dominant performance bottleneck.
Profiling from the `texas-perf-optimization` campaign (37914ms → 25082ms after
7 accepted optimizations) shows:

```
lifecycle:applyEffects = 16725ms (66.7% of total simulation time)
  - 4302 phase transition calls @ 3.89ms each
  - ~300K AST node evaluations at ~0.054ms per dispatch
  - Leaf effects (setVar, moveAll, etc.) total ~490ms
  - Dispatch + control flow overhead = 16235ms (97% of lifecycle time)
```

The per-node overhead (0.054ms) includes: `effectKindOf` → registry lookup →
handler call → context spreading → binding resolution → result normalization.
Each of these has already been individually optimized (exp-016, 031, 032, 035).
The overhead is **inherent to AST interpretation** — it cannot be further
reduced without changing the execution model.

## Objective

Pre-compile frequently-executed effect sequences (phase `onEnter`/`onExit`,
and optionally action effects) into optimized JavaScript functions at
`createGameDefRuntime` time. Compiled functions bypass the entire dispatch
chain, performing operations directly.

**Target:** 50-70% reduction in `lifecycle:applyEffects` time (~8000-12000ms
savings), bringing total simulation time to ~15000-17000ms (40-48% improvement
from the post-optimization baseline of 25082ms, or 56-60% from the original
37914ms).

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism):** The compiler handles any game's effect
  AST — it compiles based on AST node types, not game-specific knowledge.
- **Foundation 5 (Determinism):** Compiled functions produce bit-identical
  state transitions. Verified by running both paths in debug mode.
- **Foundation 6 (Bounded Computation):** Compiled loops preserve the same
  iteration bounds. `forEach` compiles to a counted loop bounded by the query
  result length. Budget enforcement remains active.
- **Foundation 7 (Immutability):** Compiled functions return new state objects.
  Internal transient mutation with a final freeze is acceptable per the
  FOUNDATIONS.md addendum on performance.

## Architecture

### Compilable Effect Patterns

Phase 1 (core patterns covering ~90% of Texas Hold'em lifecycle effects):

| Pattern | Compiled form |
|---------|---------------|
| `setVar` (global, literal value) | Direct dict spread: `{ ...state.globalVars, [name]: value }` |
| `setVar` (global, ref value) | Dict spread with lookup: `{ ...state.globalVars, [name]: state.globalVars[otherName] }` |
| `setVar` (pvar, chosen player) | Per-player dict spread with binding lookup |
| `addVar` (global/pvar) | Arithmetic + clamped write |
| `if` (simple comparison) | Direct `===` / `!==` / `<` / `<=` / `>` / `>=` check |
| `if` (and/or) | Short-circuit `&&` / `||` chain |
| `forEach` over `{ query: "players" }` | `for (let p = 0; p < state.playerCount; p++)` |
| `gotoPhaseExact` | Phase field update + compiled lifecycle call |
| Literal values | Inlined constants |
| `ref: gvar` / `ref: pvar` / `ref: binding` | Direct property access |

Phase 2 (advanced patterns):

| Pattern | Compiled form |
|---------|---------------|
| `forEach` over `nextInOrderByCondition` | Compiled ordered iteration with condition |
| `aggregate` (count/sum) | Compiled reduction loop |
| `moveAll` | Compiled zone token transfer |
| `let` bindings | Local variable assignment |

### Fallback Strategy

Any AST node that doesn't match a compilable pattern triggers a fallback to
the interpreter for that subtree. The compiled function calls
`applyEffects(subtree, ctx)` for the non-compilable portion, then resumes
compiled execution with the result state.

This ensures 100% correctness — the compiler is strictly an optimization, never
changing behavior.

### Verification (Debug Mode)

When `ExecutionOptions.verifyCompiledEffects` is true:
1. Run the compiled path, producing `compiledState`.
2. Run the interpreted path, producing `interpretedState`.
3. Assert `computeFullHash(compiledState) === computeFullHash(interpretedState)`.
4. If mismatch, throw with diagnostic details.

This runs during the full test suite (not in benchmarks) to catch compiler bugs.

### Module Structure

```
packages/engine/src/kernel/
  effect-compiler.ts          # AST → JS function compiler
  effect-compiler-patterns.ts # Pattern matchers for compilable nodes
  effect-compiler-codegen.ts  # Code generation for each pattern
  effect-compiled-cache.ts    # Cache of compiled functions on GameDefRuntime
```

### Integration Point

`GameDefRuntime` gains a `compiledLifecycleEffects` map:

```typescript
interface GameDefRuntime {
  // ... existing fields ...
  readonly compiledLifecycleEffects: ReadonlyMap<string, CompiledEffectSequence>;
}

interface CompiledEffectSequence {
  readonly phaseId: string;
  readonly lifecycle: 'onEnter' | 'onExit';
  readonly execute: (state: GameState, rng: Rng, bindings: Record<string, unknown>) => EffectResult;
  readonly coverageRatio: number; // fraction of AST nodes compiled (for diagnostics)
}
```

`dispatchLifecycleEvent` checks for a compiled version before falling back to
the interpreter.

## Profiling Evidence

From the `texas-perf-optimization` campaign run-profile.mjs output:

```
effect:if: 33738ms (130886 calls, avg 0.26ms) — inclusive, wraps all nested
effect:gotoPhaseExact: 16764ms (4302 calls, avg 3.9ms)
lifecycle:applyEffects: 16725ms (4302 calls, avg 3.89ms)
effect:forEach: 190ms (24933 calls, avg 0.01ms)
effect:setVar: 128ms (104949 calls, avg 0ms)
```

The leaf effects total ~490ms. The remaining 16235ms is dispatch overhead.
Texas Hold'em's 7 phases have 215 total effect nodes. With 4302 transitions,
that's ~925K node evaluations — each paying the full dispatch cost.

A compiled flop onEnter (35 nodes) would execute as ~10 lines of direct JS
instead of 35 dispatch cycles. At 3.89ms interpreted vs ~0.1ms compiled
(estimated from the 490ms leaf effect time / 4302 calls ≈ 0.11ms of actual
work per transition), the savings per transition would be ~3.8ms.

## Dependencies

- None. This spec is self-contained.
- The `PerfProfiler` infrastructure (already committed) provides the
  verification/profiling hooks needed for development.

## Estimated Effort

Large — 2000-3000 lines of new code across 4-5 new files. The compiler needs
pattern matching for each compilable node type, code generation, fallback
integration, and debug verification. Testing requires compiled-vs-interpreted
comparison for multiple game specs.

## Risks

- **Correctness:** The compiled path must be bit-identical to the interpreted
  path. The debug verification mode mitigates this.
- **Maintenance:** Each new effect type added to the engine needs a
  corresponding compiler pattern. The fallback ensures new effects work
  correctly even without a compiler pattern — they just don't get the speedup.
- **V8 JIT interaction:** The generated functions must have consistent shapes
  to avoid hidden class deoptimization (lesson from exp-026/027).

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - the compiled lifecycle architecture described here was implemented across the kernel, including runtime compilation, verification, profiler bucketing, and lifecycle dispatch integration;
  - this ticket cycle tightened the production architecture by preserving the cached runtime through initialization, phase transitions, trigger dispatch, boundary expiry, and phase advance so compiled lifecycle handlers remain active in real Texas simulations;
  - Texas production regression coverage and benchmark comparison tooling now exercise compiled-versus-interpreted lifecycle execution directly.
- Deviations from original plan:
  - the current codebase uses the existing kernel module layout rather than the early module split proposed in this spec;
  - FITL still has no compiled lifecycle entries in production, so compiled coverage remains focused on Texas rather than forcing speculative cross-game parity tests;
  - the benchmark work extended the existing Texas performance campaign instead of introducing a separate profiling framework.
- Verification results:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm turbo typecheck`
  - `node campaigns/texas-perf-optimization/run-benchmark.mjs --seeds 5 --players 2 --max-turns 50`
