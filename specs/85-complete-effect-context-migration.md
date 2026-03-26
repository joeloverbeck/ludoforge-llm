# Spec 85 — Complete Effect Context Migration

**Status**: Draft
**Dependencies**: Spec 77 (EffectContext static/dynamic split), Spec 78 (draft state)
**Blocked by**: None
**Enables**: Future perf campaigns targeting effect handler allocation overhead

## Problem

Spec 77 split the monolithic `EffectContext` (~24 fields) into `EffectEnv` (static,
~22 fields, created once per scope) and `EffectCursor` (dynamic, 5 fields, mutated
per-effect). The dispatch loop (`applyEffectsWithBudgetState`) and control-flow
handlers (`applyIf`, `applyLet`, `applyForEach`, `applyReduce`,
`applyRemoveByPriority`) were fully migrated to native `(env, cursor)` signatures.

However, **28 call sites in 7 effect handler files** still call
`fromEnvAndCursor(env, cursor)` which creates a full `{ ...env, ...cursor }` merge
(~30 field spreads) when downstream eval functions only need `ReadContext` (~13
fields). This is the last unfinished piece of Spec 77.

### Quantified cost

Per the FITL perf-optimization campaign (13 experiments, March 2026):
- FITL benchmark runs ~30-60K effect dispatches per benchmark (3 games × 200
  turns × ~50-100 effects per move)
- Each `fromEnvAndCursor` call in a handler spreads ~30 fields into a new object
- The cheaper `mergeToReadContext` spreads ~13 fields (env only, overlaying state
  and bindings from cursor)
- Estimated savings: ~17 fewer field copies × 30-60K calls = 500K-1M avoided
  property writes per benchmark

### V8 JIT context

The FITL perf campaign proved that V8 hidden class monomorphism is the binding
constraint on kernel performance. Key findings (HIGH CONFIDENCE, 0.85-0.98):

1. **Adding fields to hot-path interfaces causes 4-7% regressions** — any new
   property on `EffectCursor` or `GameDefRuntime` breaks V8 hidden class
   optimization (proven in 5 experiments)
2. **Import aliasing causes 6.82% regression** — `import { X as Y }` breaks V8
   function identity at monomorphic call sites
3. **Function body enlargement causes 4.56% regression** — inlining dispatch into
   the effect loop exceeded V8's inlining threshold
4. **Branch reordering causes 4% regression** — V8 JIT optimizes branch prediction
   based on the original ordering profile
5. **Type widening is safe** — changing a TypeScript parameter type from
   `EffectContext` to `ReadContext` is a compile-time-only change; the same runtime
   objects flow through, preserving V8 hidden class shapes

This spec is designed to be V8-safe: it widens TypeScript types and replaces
`fromEnvAndCursor` with `mergeToReadContext`/`mergeToEvalContext` (which already
exist and are proven V8-safe in `effects-control.ts` where they're already used).

## Objective

Eliminate all 28 `fromEnvAndCursor` call sites in effect handlers. Replace with
`mergeToReadContext` or `mergeToEvalContext`. Remove `fromEnvAndCursor` from the
codebase. Complete the Spec 77 migration.

## Foundations Alignment

- **F1 (Engine Agnosticism)**: No game-specific changes.
- **F5 (Determinism)**: Same computation, fewer intermediate objects. Determinism
  parity verified by stateHash comparison.
- **F7 (Immutability)**: No change to external contract. The scoped mutation
  exception (Spec 78) is unaffected.
- **F9 (No Backwards Compatibility)**: `fromEnvAndCursor` is removed outright, not
  deprecated. All callers updated in the same change.
- **F10 (Architectural Completeness)**: Completes a migration started in Spec 77
  rather than leaving it partially done.

## Design

### Phase 1 — Widen downstream function signatures

Functions currently typed as `EffectContext` that only use `ReadContext` fields:

| Function | File | Current param | New param | Reason |
|----------|------|---------------|-----------|--------|
| `resolveRuntimeScopedEndpointImpl` | scoped-var-runtime-access.ts | `EffectContext` | `ReadContext`, add `mode` param | Only uses `evalCtx.mode` beyond ReadContext |
| `resolveRuntimeScopedEndpoint` | scoped-var-runtime-access.ts | `EffectContext` | `ReadContext`, add `mode` param | Wrapper — follows impl |
| `resolveRuntimeScopedEndpointWithMalformedSupport` | scoped-var-runtime-access.ts | `EffectContext` | `ReadContext`, add `mode` param | Wrapper — follows impl |
| `resolveScopedVarDef` | scoped-var-runtime-access.ts | `EffectContext` | `Pick<ReadContext, 'def'>` | Only uses `ctx.def` |
| `resolveChoiceDecisionPlayer` | effects-choice.ts | `EffectContext` | `ReadContext` | Calls `resolveSinglePlayerSel(ReadContext)` |

**V8 JIT safety**: Type widening is a TypeScript-only change. The runtime objects
passed at call sites have identical hidden class shapes before and after.

### Phase 2 — Replace `fromEnvAndCursor` call sites

For each call site, replace:
```typescript
// BEFORE (28 call sites):
const evalCtx = fromEnvAndCursor(env, evalCursor);

// AFTER:
const evalCtx = mergeToReadContext(env, evalCursor);
// or mergeToEvalContext(env, cursor) when moveParams merge is needed
```

For calls to `resolveRuntimeScopedEndpoint` (effects-var.ts, effects-resource.ts),
also pass `env.mode` as the new separate `mode` parameter.

For `resolveTraceProvenance` and `emitVarChangeTraceIfChanged` (which use
`Pick<EffectContext, ...>` types), construct a small inline pick object from env +
cursor fields (~4 fields, cheaper than 13-field mergeToReadContext).

**File order** (smallest first for incremental validation):
1. `effects-binding.ts` — 1 site
2. `effects-reveal.ts` — 2 sites
3. `effects-subset.ts` — 2 sites
4. `effects-var.ts` — 3 sites
5. `effects-resource.ts` — 2 sites
6. `effects-choice.ts` — 8 sites
7. `effects-token.ts` — 10 sites

### Phase 3 — Cleanup

1. Remove `fromEnvAndCursor` from `effect-context.ts`
2. Remove stale `EffectContext` imports from effect handler files
3. Update the comment in `effect-compiler-runtime.ts` that references
   `fromEnvAndCursor`

## Scope

### In scope
- All 28 `fromEnvAndCursor` call sites in 7 effect handler files
- Downstream signature widening in `scoped-var-runtime-access.ts` and
  `effects-choice.ts`
- Removal of `fromEnvAndCursor` and `compat()` adapter if unused
- All callers of widened functions updated (Foundation 9)

### Out of scope
- Changing eval function signatures (`evalValue`, `evalCondition`, `resolveRef`)
  — these already accept `ReadContext` and are unaffected
- Modifying `EffectCursor` or `GameDefRuntime` interfaces — V8 JIT constraint
- Performance benchmarking as part of this spec — the improvement is expected to
  be modest (0.5-2%) given campaign experiment results. The primary value is
  architectural completeness (Foundation 10).

## Testing

1. **Existing test suite** (4853 tests) passes without modification — the change
   is internal plumbing with identical observable behavior
2. **Determinism parity**: same seed + same move sequence = identical stateHash
   before and after (verified by `pnpm turbo test` which includes determinism
   tests)
3. **Typecheck** (`pnpm turbo typecheck`) catches any case where a widened function
   is passed an object missing a required field
4. **No new tests needed**: all effect execution paths are already covered by
   existing unit, integration, and e2e tests

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| V8 JIT deopt from `mergeToReadContext` producing different hidden class than `fromEnvAndCursor` | LOW | `mergeToReadContext` is already used in 6 call sites in `effects-control.ts` without issues. Same spread pattern, fewer fields. |
| Missed `mode` parameter in `resolveRuntimeScopedEndpoint` callers | LOW | TypeScript strict mode catches missing required parameters at compile time. |
| `resolveTraceProvenance` receives incomplete pick object | LOW | Existing `Pick<EffectContext, ...>` type annotation catches missing fields. |
