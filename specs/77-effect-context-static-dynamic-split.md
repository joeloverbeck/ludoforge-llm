# Spec 77 — EffectContext Static/Dynamic Split

**Status**: PROPOSED
**Dependencies**: None
**Blocked by**: None
**Enables**: Spec 78 (Draft State) can use the split context naturally;
Spec 79 (Compiled Effect Path) benefits from smaller dynamic context

## Problem

EffectContext has **~24 fields** (11 from ReadContext + 2 from WriteContext +
11 from EffectContextBase). Of these, only **4-5 change between effect
iterations** within a single `applyEffects` call:

| Changes per effect | Constant per applyEffects call |
|---|---|
| `state` | `def` |
| `rng` | `adjacencyGraph` |
| `bindings` | `runtimeTableIndex` |
| `decisionScope` | `resources` |
| `effectPath` (tracing only) | `collector` |
| | `activePlayer`, `actorPlayer` |
| | `moveParams` |
| | `traceContext` |
| | `cachedRuntime` |
| | `maxEffectOps`, `verifyCompiledEffects` |
| | `phaseTransitionBudget` |
| | `freeOperation`, `freeOperationOverlay` |
| | `freeOperationProbeScope` |
| | `decisionAuthority`, `mode` |
| | `maxQueryResults` |

Every nested effect call creates a new context via spread:

- **`applyLet`**: `{ ...ctx, bindings: newBindings }` — **24 fields spread to change 1** (102K calls/10 games, 7.9% of CPU)
- **`applyForEach`**: `{ ...ctx, state, rng, decisionScope, bindings }` — **24 fields spread per iteration**
- **`applyReduce`**: `{ ...ctx, bindings }` — **24 fields spread per accumulation step**

The exp-008 mutable `workCtx` pattern optimized the TOP-LEVEL loop in
`applyEffectsWithBudgetState`, but nested calls (from `let`, `forEach`,
`reduce`, `evaluateSubset`) still spread the full 24-field context.

### Profiling evidence

- `applyLet` self-time: 7.9% of CPU (20-game profile, post exp-013)
- `createExecutionEffectContext`: 1.2% of CPU
- Combined context-creation overhead: ~10% of CPU

## Objective

Split EffectContext into a **static** part (fields constant during effect
execution) and a **dynamic** part (fields that change per effect). Effect
handlers receive both, but only clone the small dynamic part for nested
calls.

**Target**: 5-10% total improvement by reducing per-effect context creation
from 24-field spreads to 4-5 field spreads for nested calls.

## Foundations Alignment

- **Foundation 7 (Immutability)**: The static context IS immutable — it's
  created once and shared by reference. The dynamic context changes between
  effects but is thread-local to the effect execution pipeline (no cross-move
  sharing). The external contract (applyMove returns new state) is preserved.
- **Foundation 10 (Architectural Completeness)**: This is a clean separation
  of concerns. The static part represents the "execution environment" (what
  game, what board, what phase). The dynamic part represents the "execution
  state" (current state, current bindings, current RNG).
- **Foundation 1 (Engine Agnosticism)**: The split is generic — it separates
  environment from state for any game's effect execution.

## Design

### New types

```typescript
/**
 * Fields that are constant throughout a single applyEffects call.
 * Created once, shared by reference across all effects in the sequence.
 */
export interface EffectEnv {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
  readonly resources: EvalRuntimeResources;
  readonly collector: ExecutionCollector;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
  readonly traceContext?: EffectTraceContext;
  readonly maxEffectOps?: number;
  readonly verifyCompiledEffects?: boolean;
  readonly freeOperation?: boolean;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly cachedRuntime?: GameDefRuntime;
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay;
  readonly freeOperationProbeScope?: FreeOperationProbeScope;
  readonly chooseNTemplateCallback?: (template: ChooseNTemplate) => void;
  readonly maxQueryResults?: number;
  readonly decisionAuthority: DecisionAuthorityStrictContext | DecisionAuthorityProbeContext;
  readonly mode: 'execution' | 'discovery';
}

/**
 * Fields that change between effects in an execution sequence.
 * Small enough to clone cheaply for nested scopes.
 */
export interface EffectCursor {
  state: GameState;
  rng: Rng;
  bindings: Readonly<Record<string, unknown>>;
  decisionScope: DecisionScope;
  effectPath?: string;
}
```

### Migration strategy

The change is mechanical but touches many files. To reduce risk:

1. **Phase 1**: Add `EffectEnv` and `EffectCursor` types alongside the
   existing `EffectContext`. Add a `toEnvAndCursor(ctx)` helper that splits
   an existing context, and a `fromEnvAndCursor(env, cursor)` helper that
   recombines. Update the effect dispatch loop to use the split internally.

2. **Phase 2**: Update effect handlers one-by-one to accept `(effect, env,
   cursor)` instead of `(effect, ctx)`. Each handler migration is independent
   and can be tested in isolation.

3. **Phase 3**: Remove the old `EffectContext` type and the compatibility
   helpers. Update the compiled effect path.

### Effect dispatch loop changes

```typescript
// Before (current):
const workCtx: any = { ...ctx };
for (let i = 0; i < effects.length; i++) {
  workCtx.state = currentState;
  workCtx.rng = currentRng;
  workCtx.bindings = currentBindings;
  workCtx.decisionScope = currentDecisionScope;
  const result = applyEffectWithBudget(effects[i]!, workCtx, budget);
  // ...
}

// After:
const env = toEffectEnv(ctx);
const cursor: EffectCursor = {
  state: ctx.state, rng: ctx.rng,
  bindings: ctx.bindings, decisionScope: ctx.decisionScope,
};
for (let i = 0; i < effects.length; i++) {
  const result = applyEffectWithBudget(effects[i]!, env, cursor, budget);
  cursor.state = result.state;
  cursor.rng = result.rng;
  cursor.bindings = result.bindings ?? cursor.bindings;
  cursor.decisionScope = result.decisionScope ?? cursor.decisionScope;
  // ...
}
```

The cursor is **mutated in place** between iterations (safe because effect
execution is synchronous). For nested calls (let, forEach), a NEW cursor is
created:

```typescript
// applyLet — before:
const nestedCtx = { ...ctx, bindings: { ...ctx.bindings, [bind]: value } };
applyEffectsWithBudget(effects, nestedCtx, budget);

// applyLet — after:
const nestedCursor = { ...cursor, bindings: { ...cursor.bindings, [bind]: value } };
applyEffectsWithBudget(effects, env, nestedCursor, budget);
// ^ only 5 fields spread instead of 24
```

### ReadContext compatibility

`evalValue`, `evalCondition`, `evalQuery`, `resolveRef` currently receive
`ReadContext`. These functions need access to both env fields (def,
adjacencyGraph, bindings) and cursor fields (state, activePlayer).

Options:
1. **Merge on demand**: Create a `ReadContext` from `env + cursor` only when
   calling eval functions. This adds a merge cost but localizes it.
2. **Pass env + cursor separately**: Change eval function signatures to accept
   both. More invasive but eliminates the merge.
3. **ReadContext wrapper**: Create a lightweight object that delegates to env
   and cursor. Avoids copying but adds indirection.

**Recommended**: Option 1 for Phase 1 (lowest risk), migrate to Option 2 in
Phase 3 if profiling shows the merge cost is significant.

## Scope

### Files affected (Phase 2 — handler migration)

- `packages/engine/src/kernel/effect-context.ts` — new types + helpers
- `packages/engine/src/kernel/effect-dispatch.ts` — loop changes
- `packages/engine/src/kernel/effect-registry.ts` — handler signature
- `packages/engine/src/kernel/effects-control.ts` — if, let, forEach, reduce
- `packages/engine/src/kernel/effects-var.ts` — setVar, addVar
- `packages/engine/src/kernel/effects-token.ts` — moveToken, createToken, etc.
- `packages/engine/src/kernel/effects-resource.ts` — transferVar
- `packages/engine/src/kernel/effects-turn-flow.ts` — gotoPhaseExact, etc.
- `packages/engine/src/kernel/effects-choice.ts` — chooseOne, chooseN
- `packages/engine/src/kernel/effects-binding.ts` — bindValue
- `packages/engine/src/kernel/effects-subset.ts` — evaluateSubset
- `packages/engine/src/kernel/effect-compiler.ts` — compiled path
- `packages/engine/src/kernel/effect-compiler-codegen.ts` — compiled fragments
- All effect handler test files

### Files NOT affected

- GameDef schema (no change to data format)
- GameSpecDoc YAML
- Runner
- Agents (they call the kernel API, not effect handlers directly)

## Testing

- **Determinism**: Same seed + same actions = identical state hash
- **Parity**: Run both old and new handler signatures for N games, verify identical traces
- **Performance**: Benchmark before/after on Texas Hold'em corpus
- **FITL compilation**: Verify FITL game spec compiles and runs correctly

## Risks

- **Large diff**: ~30 files touched. Mitigated by the phased approach (Phase 1
  uses compatibility helpers, Phase 2 migrates handlers individually).
- **ReadContext merge cost**: If option 1 (merge on demand) creates too many
  merged objects, it could negate the savings. Profiling during Phase 1 will
  reveal this before committing to the full migration.
