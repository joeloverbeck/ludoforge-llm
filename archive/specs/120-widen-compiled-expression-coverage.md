# Spec 120: Widen Compiled Expression Coverage

**Status**: COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: None (extends existing infrastructure)
**Source**: `fitl-perf-optimization` campaign V8 profiling data (2026-04-09), global lessons from 4 prior perf campaigns

## Overview

Extend the existing `tryCompileCondition` / `tryCompileValueExpr` / `tryCompileTokenFilter` closure-chain compilation framework to handle more AST node types, and apply compiled predicates to all condition evaluation sites — not just pipeline legality/cost. The compilation strategy remains closure-chain with `try-or-fallback` to the interpreter. No new compilation architecture is introduced.

### Motivation

V8 CPU profiling of FITL (the most complex game spec) shows that interpretive AST evaluation consumes ~19% of total CPU:

| Function | CPU % | Role |
|----------|-------|------|
| `resolveRef` | 8.1% | Reference resolution (bindings, state vars, zone props) |
| `matchesTokenFilterExpr` | 5.8% | Token filter predicate evaluation |
| `evalCondition` | 5.6% | Boolean condition evaluation |
| `evalQuery` | 2.6% | Zone/token query evaluation |

A 10-experiment performance campaign proved these functions are at V8's JIT optimization ceiling — any modification to their internals causes deoptimization (3-7% regression per change). The only remaining path to reduce this cost is to bypass the interpreter entirely via compiled predicates.

The kernel already has a compilation framework (`condition-compiler.ts`, `token-filter-compiler.ts`) using closure-chain compilation with WeakMap caching. It's proven safe — no V8 deopt, no determinism issues. But its coverage is narrow:

- **Condition compiler**: handles `==`, `!=`, `<`, `<=`, `>`, `>=`, `and`, `or`, `not`. Returns `null` for `in`, `zonePropIncludes`, `markerStateAllowed`, `markerShiftAllowed`, `adjacent`, `connected`.
- **Value compiler**: handles literals, `gvar`, `pvar(active)`, `binding`, `aggregate count(tokensInZone)`. Returns `null` for arithmetic, `concat`, `if`-then-else, `sum`/`min`/`max` aggregates, most reference types.
- **Token filter compiler**: handles literal-value predicates only. Returns `null` when predicates use dynamic `ValueExpr` values.
- **Application sites**: compiled predicates are only used for pipeline legality/cost conditions. Action `pre`, trigger `match`/`when`, terminal conditions, and enumeration snapshot conditions all use the interpreter.

This spec widens both the compiler coverage and the application sites.

## Deliverables

### 1. Widen Value Expression Compiler (`tryCompileValueExpr`)

This is the highest-leverage change — both `tryCompileCondition` and `tryCompileTokenFilter` depend on it.

**Add support for:**

| Node type | AST tag / shape | Accessor pattern |
|-----------|----------------|-----------------|
| Arithmetic | `{ _t: 6, op: '+'/'-'/'*'/'/', left, right }` | Compose left/right accessors with operator |
| Concat | `{ _t: 3, concat: [...] }` | Compose child accessors, join results |
| If-then-else | `{ _t: 4, if: { when, then, else } }` | Compile condition + both branches |
| `zoneCount` | `{ _t: 2, ref: 'zoneCount', zone: <string> }` | Direct `state.zones[zoneId].length` lookup |
| `zoneVar` | `{ _t: 2, ref: 'zoneVar', zone: <string>, var: <string> }` | Direct `state.zoneVars[zoneId][varName]` lookup |
| `tokenProp` | `{ _t: 2, ref: 'tokenProp', token: <string>, prop: <string> }` | Resolve via binding + token state index |
| `pvar` (non-active) | `{ _t: 2, ref: 'pvar', player: <PlayerSel>, var: <string> }` | Extend existing `pvar` accessor beyond `active`. Only literal seat names are compilable — complex `PlayerSel` variants (`relative`, `all`, `allOther`, `chosen`) require runtime seat resolution and return `null`. |
| Scalar array literal | `{ _t: 1, scalarArray: [...] }` | Constant accessor |

**Explicitly deferred (implementation tickets decide priority):**

- `aggregate sum/min/max` — requires compiled query iteration
- `zoneProp` with dynamic zone reference — requires compiled zone selector resolution
- Dynamic variable names (`VarNameExpr` with binding interpolation) — requires compiled binding template resolution

### 2. Widen Condition Compiler (`tryCompileCondition`)

**Add support for:**

| Condition op | Depends on | Accessor pattern |
|-------------|-----------|-----------------|
| `in` | `tryCompileValueExpr` for item + set | Compiled membership test |
| `zonePropIncludes` | `tryCompileValueExpr` for zone + prop + value | Zone property array inclusion check |
| `markerStateAllowed` | `tryCompileValueExpr` for marker + space + state | Marker lattice constraint lookup |
| `markerShiftAllowed` | `tryCompileValueExpr` for marker + space + delta | Marker lattice transition lookup |

**Explicitly deferred:**

- `adjacent` / `connected` — require adjacency graph traversal, low frequency, high complexity

### 3. Widen Token Filter Compiler (`tryCompileTokenFilter`)

**Add support for:**

- Dynamic `ValueExpr` predicates: when `tryCompileValueExpr` succeeds for a predicate's value, compose the compiled value accessor with the field accessor to produce a fully compiled predicate. Currently, only literal values are compiled.

This means a filter like `{ op: 'eq', prop: 'faction', value: { _t: 2, ref: 'binding', name: '$faction' } }` can compile when the binding reference compiles (which it does today).

### 4. Widen Application Sites

Apply compiled predicates to all condition evaluation call sites:

| Call site | File(s) | Integration pattern |
|-----------|---------|-------------------|
| Action `pre` conditions | `legal-moves.ts` (2 sites), `legal-choices.ts` (2 sites), `apply-move.ts` (2 sites), `free-operation-viability.ts` (1 site) | Look up compiled predicate before `evalCondition` |
| Trigger `match` | `trigger-dispatch.ts` | Look up compiled predicate before `evalConditionTraced` |
| Trigger `when` | `trigger-dispatch.ts` | Look up compiled predicate before `evalConditionTraced` |
| Terminal `conditions[].when` | `terminal.ts` | Look up compiled predicate before `evalCondition` |
| Enumeration snapshot conditions | `legal-moves.ts` discovery path | Look up compiled predicate where applicable |

Each call site uses the fallback pattern:
```typescript
const compiled = cache.get(conditionAst);
if (compiled !== null) {
  return compiled(state, activePlayer, bindings, snapshot);
}
return evalCondition(conditionAst, ctx);
```

**Scope note:** `evalCondition` has 32 occurrences across 17 kernel files. This spec targets the sites listed above — these are the highest-frequency call sites per V8 CPU profiling. Additional sites (e.g., `eval-query.ts`, `effects-token.ts`, `effects-control.ts`, `spatial.ts`) are lower-frequency and can be addressed in follow-up implementation tickets if profiling shows measurable benefit.

**Tracing note (Foundation 9):** Trigger call sites (`trigger-dispatch.ts`) currently use `evalConditionTraced`, which emits a condition trace event via `emitConditionTrace`. When a compiled predicate bypasses `evalCondition`, the call site must still emit the trace event with the compiled result to preserve replay and auditability. The compiled path should call `emitConditionTrace` directly after evaluation.

### 5. Unified Compilation Cache

Extend `compiled-condition-cache.ts` (or introduce a parallel cache module) to cache compiled predicates for all condition sites — not just pipeline predicates. Cache keyed on AST node reference (WeakMap), with null sentinel for non-compilable expressions.

The existing `compiled-token-filter-cache.ts` already implements a per-expression WeakMap cache keyed on `TokenFilterExpr` — this is the model for the unified condition cache. The current pipeline cache (`compiled-condition-cache.ts`) uses a different strategy: a WeakMap keyed on the `ActionPipelineDef[]` array that returns a `Map` of all pipeline predicates. The unified cache should follow the per-expression pattern (direct AST-node-to-closure WeakMap) rather than the pipeline-array pattern, since action `pre`, trigger, and terminal conditions are not part of pipeline arrays.

The cache is populated lazily on first evaluation attempt. No eager compilation pass.

## Architecture

### Dependency Graph (unchanged)

```
resolveRef (leaf — no eval dependencies)
     ^
     |
tryCompileValueExpr ←── tryCompileCondition
     ^                        ^
     |                   (recursive)
     └── tryCompileTokenFilter (via composed value accessors)
```

The compilation mirrors the interpreter dependency graph. `tryCompileValueExpr` is the foundation — widening it unlocks condition and token filter compilation.

### Compilation Strategy

**Closure-chain compilation.** Each AST node compiles to a closure that calls child closures. Example:

```
AST: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'support' }, right: 5 }

Compiles to:
  leftAccessor = (state) => state.globalVars['support']
  rightAccessor = () => 5
  compiled = (state, activePlayer, bindings, snapshot) =>
    leftAccessor(state, activePlayer, bindings, snapshot) >= rightAccessor(state, activePlayer, bindings, snapshot)
```

**`null` means "not compilable".** `tryCompile*` returning `null` is a normal code path. The caller falls back to the interpreter silently. This allows incremental widening — each new node type support is independently shippable.

### V8 JIT Safety Constraints

The performance campaign established hard constraints on what changes are safe in this codebase:

1. **Never add fields to hot-path object interfaces** (`ReadContext`, `EffectCursor`, `GameDefRuntime`, `MoveEnumerationState`). All caches use module-level WeakMaps.
2. **Never modify small utility functions** (<60 lines) called from the kernel hot path. V8 inlines them into callers; changing the inlined body changes the caller's optimization profile.
3. **Never return different object shapes from the same call site** (singleton vs fresh object). V8 inline caches assume consistent shapes.
4. **The compiled predicate signature** `(state, activePlayer, bindings, snapshot?) → boolean | ScalarValue` deliberately avoids the `ReadContext` interface — it takes primitive arguments, decoupling from object shape concerns.

## Edge Cases

1. **Circular AST references.** `evalCondition` calls `evalValue` (comparisons), `evalValue` calls `evalCondition` (`if`-then-else). The compiler handles this naturally via mutual recursion in `tryCompile*`. No infinite recursion because AST depth is finite (Foundation 10).

2. **Snapshot vs no-snapshot call sites.** Compiled accessors check `snapshot !== undefined` before using snapshot values (existing pattern in `condition-compiler.ts`). Call sites that use snapshots (enumeration) pass it; others pass `undefined`.

3. **Token filter predicates with uncompilable dynamic values.** When `tryCompileValueExpr` returns `null`, the entire filter falls back to the interpreter. No partial compilation.

4. **Non-determinism risk.** Compiled closures capture immutable AST values (string literals, variable names, operator types). Mutable state (`state`, `activePlayer`, `bindings`) is passed as arguments, never captured. Foundation 8 preserved.

## Testing

1. **Parity tests (mandatory per new node type).** Construct AST, evaluate via interpreter, evaluate via compiled predicate, assert identical results. Cover: typical values, boundary values, error cases.

2. **Compilation coverage diagnostic.** A test utility that takes a GameDef (e.g., FITL), attempts to compile every condition and value expression, and reports success rate. Diagnostic only — not pass/fail. Implementation tickets use it to measure progress.

3. **Determinism regression.** Existing simulation replay tests verify same seed + actions = identical stateHash. Since compiled predicates are used transparently, these implicitly verify compilation doesn't break determinism.

4. **Fallback correctness.** Test that forces interpreter fallback for a compilable expression and verifies correct results. Ensures the fallback path stays exercised in CI.

5. **Performance benchmark gate.** The `fitl-perf-optimization` campaign harness measures wall time for `evalCondition` + `resolveRef` + `matchesTokenFilterExpr`. Re-run after implementation to verify compiled path reduces this.

## FOUNDATIONS.md Alignment

| Foundation | Status | Notes |
|-----------|--------|-------|
| F1 Engine Agnosticism | Aligns | Compiles generic AST nodes — no game-specific logic |
| F7 Specs Are Data | Aligns | GameDef remains pure data. Closures built programmatically at runtime, no `eval`/`Function` constructor |
| F8 Determinism | Must prove | Parity tests + existing replay determinism tests |
| F9 Replay/Auditability | Must preserve | Trigger call sites must emit condition trace even when using compiled path — see Deliverable 4 tracing note |
| F10 Bounded Computation | Aligns | Compilation traverses finite AST once |
| F11 Immutability | Neutral | Compiled predicates are pure functions — read state, never mutate |
| F12 Compiler-Kernel Boundary | Aligns | Kernel-level runtime optimization. CNL compiler unchanged |
| F14 No Backwards Compat | Aligns | No feature flags, no opt-out. Compiled when available, interpreter otherwise |
| F15 Architectural Completeness | Aligns | Extends existing infrastructure, no parallel systems |
| F16 Testing as Proof | Must implement | Parity tests, coverage diagnostic, fallback tests |

## Scope Exclusions

- **No `new Function()` or string code generation.** Closures only.
- **No GameDef schema changes.** Compilation is a runtime optimization, not a serialized artifact.
- **No CNL compiler changes.** This is purely a kernel optimization.
- **No spatial operations** (`adjacent`, `connected`). Deferred — low frequency, high complexity.
- **No `sum`/`min`/`max` aggregate compilation.** Requires compiled query iteration — deferred.
- **No coverage mandates.** The spec defines the framework extension. Implementation tickets determine priority based on profiling data.

## Outcome

Completed: 2026-04-09

- Delivered the spec’s widening series through archived tickets `120WIDCOMEXP-001` through `120WIDCOMEXP-007`, including value-expression widening, condition widening, token-filter widening, application-site adoption, shared condition caching, coverage diagnostics, and a current-branch FITL perf rerun.
- The final implementation stayed on the existing closure-chain `tryCompile*` architecture; no parallel compiler system, code generation path, or schema change was introduced.
- Production FITL diagnostics now report `conditions=109/448 (24.3%)`, `values=396/711 (55.7%)`, and `tokenFilters=0/0` for action-parameter domains, with a focused deterministic fixture proving token-filter compilation at `2/2`.
- The live FITL perf harness no longer supports trustworthy before/after per-function baseline claims for `evalCondition` / `resolveRef` / `matchesTokenFilterExpr`, so the series recorded current-run branch metrics instead of inventing historical comparisons.

Deviations from original plan:

- The spec’s delivered `pvar` boundary aligned to the live runtime AST contract `{ id: PlayerId }` rather than stale “literal seat string” wording.
- FITL production does not currently author action-parameter token filters, so token-filter coverage proof shipped as a focused deterministic fixture in addition to the FITL diagnostic.
- The live compiled predicate surface evolved to `ReadContext`-based call signatures where that was the cleaner architectural unit for shared callsites and cache consumers.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/condition-compiler.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/token-filter-compiler.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/compiled-application-sites.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/compilation-coverage-diagnostic.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo test`
- `bash campaigns/fitl-perf-optimization/harness.sh`
