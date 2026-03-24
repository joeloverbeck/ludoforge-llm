# Spec 79 — Compiled Effect Path: DraftTracker Integration

**Status**: ✅ COMPLETED
**Dependencies**: Spec 76 (Type Tags, completed), Spec 77 (EffectContext Split,
completed), Spec 78 (Draft State, completed)
**Enables**: Performance parity between compiled and interpreted effect paths.
Whole-sequence compilation (future spec) becomes viable once the compiled path
is at parity.

## Problem

The compiled lifecycle effect system (Spec 74) was designed before the
interpreter was optimized. Specs 77 and 78 optimized the interpreter path:

- **Spec 77** split the 24-field `EffectContext` into `EffectEnv` (~22 static
  fields) + `EffectCursor` (5-6 dynamic fields), reducing per-effect context
  reconstruction cost.
- **Spec 78** introduced `DraftTracker` with copy-on-write mutable state inside
  `applyEffectsWithBudgetState`, eliminating ~25K intermediate `GameState`
  allocations per 10 games and reducing GC from 3.6% to <2%.

The compiled path was **not updated** for either optimization. It still uses:

1. **Fragment-based composition** (`composeFragments`): iterates a
   `CompiledEffectFragment[]` array, calling each fragment with a per-fragment
   context spread (`{ ...compiledCtx, decisionScope }`) plus
   `normalizeFragmentResult` (creates another object). The interpreter's mutable
   `workCursor` avoids both.

2. **Heavyweight fallback bridging** (`createFallbackFragment`): wraps
   non-compilable effects via `createCompiledExecutionContext` (reconstructs a
   full `ExecutionEffectContext` from `CompiledEffectContext` fields) plus
   `normalizeFragmentResult`. For 26-42% of effects that fall through, this
   **adds** overhead vs. running the interpreter directly.

3. **No mutable state**: Each fragment returns immutable state. The interpreter
   creates a `MutableGameState` + `DraftTracker` once at scope entry and
   mutates in-place via copy-on-write.

Pre-Spec-78 benchmarks showed the compiled path was +16% slower than the
interpreter for Texas Hold'em. The gap may have widened further since Spec 78
only optimized the interpreter side. Re-baselining is part of this spec's
deliverables.

### Impact on FITL

FITL has more lifecycle effects per phase (up to 50+ in coup/support resolution
phases) and higher fallback rates (complex forEach-over-zones, multi-level
if-else trees, trigger effects). The compiled path overhead is amplified for
FITL.

## Objective

Achieve **performance parity** between the compiled and interpreted effect paths
by integrating Spec 78's `DraftTracker` into the compiled path and eliminating
per-fragment overhead.

**Non-goal**: Whole-sequence compilation (the original Spec 79 "Option B") is
deferred to a future spec. The fragment-based architecture is preserved but
optimized.

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: DraftTracker integration is AST-based,
  not game-specific. Any game benefits.
- **Foundation 5 (Determinism)**: Compiled functions produce bit-identical
  results to the interpreter. The existing verification mode (dual execution +
  Zobrist hash comparison) is preserved unchanged.
- **Foundation 6 (Bounded Computation)**: No change to iteration bounds.
  Compiled loops remain bounded by query result length.
- **Foundation 7 (Immutability)**: Scoped internal mutation applies (Foundation
  7 explicitly allows mutable working copies within a synchronous scope).
  External contract `applyMove(state) → newState` is preserved — the input
  state is never modified.
- **Foundation 9 (No Backwards Compat)**: `normalizeFragmentResult` and
  `createCompiledExecutionContext` are deleted, not deprecated.
- **Foundation 11 (Testing)**: Parity between compiled and interpreted paths is
  proven by existing automated verification tests.

## Design

### Key decision: where does the mutable scope live?

`composeFragments` creates its own mutable state scope (matching the
interpreter's `applyEffectsWithBudgetState`). Rationale:

- The caller (`phase-lifecycle.ts`) passes immutable `GameState`. Creating
  mutable state is an internal optimization, not a lifecycle concern.
- Verification mode runs both paths independently. Each path manages its own
  mutable scope — no interaction.
- The `CompiledEffectFn` signature stays unchanged: `(state, rng, bindings,
  ctx) → EffectResult`.

### Change 1: Add `tracker` to `CompiledEffectContext`

**File**: `effect-compiler-types.ts`

Add an optional `tracker?: DraftTracker` field to `CompiledEffectContext`. This
is additive — no consumers break.

### Change 2: Add `buildEffectEnvFromCompiledCtx` helper

**File**: `effect-compiler-runtime.ts`

A lightweight helper that builds an `EffectEnv` directly from
`CompiledEffectContext` fields. This replaces the heavyweight
`createCompiledExecutionContext` → `createExecutionEffectContext` path for
fallback fragments. Maps the ~12 static fields (`def`, `adjacencyGraph`,
`resources`, `activePlayer`, `actorPlayer`, `moveParams`, `runtimeTableIndex`,
`traceContext`, `maxEffectOps`, `verifyCompiledEffects`,
`phaseTransitionBudget`, `profiler`, `cachedRuntime`, `collector`,
`decisionAuthority`, `mode`).

### Change 3: Integrate DraftTracker into `composeFragments`

**File**: `effect-compiler.ts`

At scope entry:
```
const mutableState = createMutableState(state);
const tracker = createDraftTracker();
let currentState = mutableState as GameState;
```

Thread `tracker` through fragment calls via `ctx`:
```
fragment.execute(currentState, currentRng, currentBindings, {
  ...compiledCtx,
  decisionScope: currentDecisionScope,
  tracker,
})
```

Inline normalization — replace `normalizeFragmentResult` with direct field reads
(same pattern as `applyEffectsWithBudgetState` loop body). Null-coalesce
`bindings`, `decisionScope`, guard `emittedEvents` and `pendingChoice`.

Delete `normalizeFragmentResult`.

### Change 4: Rebuild `createFallbackFragment`

**File**: `effect-compiler.ts`

Replace the fallback fragment's execute function:

- Use `buildEffectEnvFromCompiledCtx(ctx)` instead of
  `createCompiledExecutionContext`.
- Build an `EffectCursor` directly: `{ state, rng, bindings, decisionScope,
  effectPath }`.
- Always call `applyEffectsWithBudgetState(effects, env, cursor, budget)` —
  remove the two-path branching.
- Remove `normalizeFragmentResult` wrapper — `applyEffectsWithBudgetState`
  already returns a well-formed `EffectResult`.

**Note on nested scopes**: The fallback's `applyEffectsWithBudgetState` call
creates its own mutable state + tracker (it unconditionally creates them at
entry). This means fallback fragments get a nested mutable scope rather than
sharing the parent's tracker. This is correct (nested copy-on-write is safe)
but suboptimal. Sharing trackers across scopes is a follow-up optimization if
profiling shows it matters.

### Change 5: Make codegen fragments draft-aware

**File**: `effect-compiler-codegen.ts`

For `compileSetVar` and `compileAddVar`: when `ctx.tracker` is present, use
`writeScopedVarsMutable(state, writes, ctx.tracker)` instead of
`writeScopedVarsToState(state, writes)`. Return the same `state` reference
(mutated in-place) rather than a new state object.

For `executeEffectList` fallback path: replace `createCompiledExecutionContext` +
`ctx.fallbackApplyEffects` with `buildEffectEnvFromCompiledCtx` +
`applyEffectsWithBudgetState`. Thread `tracker` from ctx into the cursor.

### Change 6: Dead code removal

- Delete `normalizeFragmentResult` from `effect-compiler.ts`.
- Delete `createCompiledExecutionContext` from `effect-compiler-runtime.ts` if
  no longer referenced.
- Evaluate whether `fallbackApplyEffects` on `CompiledEffectContext` is still
  needed. If all fallback paths now use `applyEffectsWithBudgetState` directly,
  remove it.
- Update imports.

## Scope

### Files affected

- `packages/engine/src/kernel/effect-compiler-types.ts` — add `tracker` field
- `packages/engine/src/kernel/effect-compiler-runtime.ts` — add
  `buildEffectEnvFromCompiledCtx`, remove `createCompiledExecutionContext`
- `packages/engine/src/kernel/effect-compiler.ts` — rewrite `composeFragments`,
  rebuild `createFallbackFragment`, delete `normalizeFragmentResult`
- `packages/engine/src/kernel/effect-compiler-codegen.ts` — draft-aware
  `compileSetVar`/`compileAddVar`, replace `executeEffectList` fallback
- `packages/engine/test/unit/kernel/effect-compiler*.ts` — unit tests
- `specs/79-compiled-effect-path-redesign.md` — this file

### Files NOT affected

- `phase-lifecycle.ts` — no changes (compiled fn signature unchanged)
- `gamedef-runtime.ts` — no changes
- `effect-dispatch.ts` — read only (reuse `applyEffectsWithBudgetState`)
- `state-draft.ts` — read only (reuse `createMutableState`, `createDraftTracker`)
- GameDef schema, GameSpecDoc YAML
- Effect handler implementations
- Simulator, runner, agents

## Testing

- **Parity verification**: Existing `verifyCompiledEffects: true` in
  `phase-lifecycle.ts` runs both compiled and interpreted paths, compares
  Zobrist hashes, rng, emittedEvents, bindings, decisionScope, pendingChoice,
  and warnings. No changes needed to verification logic.
- **Unit tests**: Test that `composeFragments` creates a mutable scope (output
  state !== input state identity). Test draft-aware codegen (`compileSetVar`,
  `compileAddVar` use `writeScopedVarsMutable` when tracker present).
- **E2E**: Full game parity via `pnpm -F @ludoforge/engine test:e2e`.
- **Performance re-baseline**: Run Texas Hold'em benchmark (10 games, multiple
  seeds) with compiled path before and after. Target: 0% overhead (parity with
  interpreter), ideally slight improvement from draft-aware codegen.

## Risks

| Risk | Mitigation |
|------|-----------|
| Mutable state leak across fragment boundary | `composeFragments` creates mutable state at entry (same as interpreter). Each fragment mutates the same working copy. External contract preserved. |
| Verification mode divergence | Verification runs compiled and interpreted paths independently. Each creates its own mutable scope. No interaction. |
| Nested mutable scopes in fallback fragments | Safe (nested copy-on-write) but suboptimal. Acceptable for parity — optimize as follow-up if profiling warrants. |
| `emitVarChangeArtifacts` in codegen still uses `createCompiledExecutionContext` | Per-effect cost (~1 object), same order as interpreter. Follow-up optimization. |

## Results (2026-03-24)

### Performance Re-baseline

Benchmark environment: Node.js, compiled JS (dist/), RandomAgent, skipDeltas.

**Texas Hold'em** (15 games, seeds 5000–5014, 500 max turns, 6 players):

| Path | Avg (ms) | Median (ms) | Min (ms) | Max (ms) |
|------|----------|-------------|----------|----------|
| Compiled | 96.8 | 85.0 | 38.8 | 172.4 |
| Interpreted | 94.1 | 91.1 | 38.0 | 171.6 |
| **Difference** | **+2.91%** | | | |

**FITL** (5 games, seeds 5000–5005, 200 max turns, 4 players; 1 seed skipped
per path due to stall-loop errors with RandomAgent):

| Path | Avg (ms) | Median (ms) | Min (ms) | Max (ms) |
|------|----------|-------------|----------|----------|
| Compiled | 51,948 | 58,869 | 1,285 | 77,523 |
| Interpreted | 52,327 | 59,988 | 1,288 | 77,847 |
| **Difference** | **-0.72%** | | | |

### Conclusion

Both games show the compiled and interpreted paths at **performance parity**
(within noise margin of ±3%). The pre-Spec-78 +16% compiled overhead is
eliminated. DraftTracker integration into the compiled path (Changes 1–5) and
dead code removal (Change 6) achieved the target.

FITL profiler breakdown (seed=42, compiled path) shows lifecycle effects are
negligible (<0.1ms) relative to legal move enumeration (~39s) and agent
decisions (~3.7s). Further lifecycle optimization would yield diminishing
returns for FITL; the bottleneck is move enumeration.

**Parity target: MET.** No follow-up optimization required for the compiled
lifecycle path. Whole-sequence compilation remains a viable future optimization.

## Future Work

- **Whole-sequence compilation**: Compile entire effect sequences into single
  functions via `new Function(...)`, eliminating the fragment array and
  composition loop entirely. Deferred to a separate spec contingent on
  post-parity profiling results.
- **Action effect compilation**: Extend compilation to action effects (not just
  lifecycle). Depends on whole-sequence compilation for meaningful benefit.
- **Shared tracker across scopes**: Allow `applyEffectsWithBudgetState` to
  accept an existing tracker, eliminating nested mutable scope creation in
  fallback fragments.

## Outcome

- **Completion date**: 2026-03-24
- **What changed**: All 6 design changes implemented across tickets 79COMEFFPATRED-001 through 006. Ticket 007 performed the performance re-baseline confirming parity.
  - `effect-compiler-types.ts`: `tracker` field added to `CompiledEffectContext`
  - `effect-compiler-runtime.ts`: `buildEffectEnvFromCompiledCtx` added, `createCompiledExecutionContext` removed
  - `effect-compiler.ts`: `composeFragments` rewritten with DraftTracker mutable scope, `createFallbackFragment` rebuilt, `normalizeFragmentResult` deleted
  - `effect-compiler-codegen.ts`: `compileSetVar`/`compileAddVar` draft-aware, `executeEffectList` fallback replaced
  - Dead code removed: `normalizeFragmentResult`, `createCompiledExecutionContext`, `fallbackApplyEffects`
- **Performance**: Texas Hold'em +2.91%, FITL -0.72% (both within ±3% noise). Pre-Spec-78 +16% overhead eliminated. Parity target met.
- **Deviations**: None from the design. Implementation followed all 6 changes as specified.
- **Verification**: 4,684 unit tests, 36 E2E tests, typecheck, lint — all pass.
