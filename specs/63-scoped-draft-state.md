# Spec 63 — Scoped Draft State for Effect Execution

## Status

Proposed

## Dependencies

None. This spec is independent and should be implemented before Spec 64 (Compiled Expression Evaluation), because the interpreter's overhead profile will change once allocation pressure from object spreads is eliminated.

## Problem

Kernel effect handlers create new state objects via object spreads on every state transition:

```typescript
return { ...state, zones: { ...state.zones, [zoneId]: newTokens } };
```

A single Rally action touching 4 zones creates ~12 intermediate state copies, most immediately discarded. CPU profiling (`perf record --perf-basic-prof`) of FITL simulations shows:

| V8 Builtin | % of CPU | Cause |
|------------|----------|-------|
| `Builtins_CreateDataProperty` | 7.77% | Object spread property assignment |
| `Builtins_CloneObjectIC` | 1.95% | Shallow clone for spreads |
| `Builtins_CloneObjectIC_Slow` | 1.69% | Slow-path clone (large objects) |
| `ScavengerCollector::CollectGarbage` | 3.80% | GC pressure from short-lived copies |
| **Total** | **~15%** | |

These are V8-internal costs that cannot be reduced by modifying JS code patterns — the engine already uses optimal spread syntax. The only way to eliminate them is to stop creating intermediate copies.

## FOUNDATIONS Alignment

Foundation 11 (Immutability) explicitly permits scoped internal mutation:

> "Within a single synchronous effect-execution scope, the kernel MAY use a private draft state or copy-on-write working state for performance. That working state MUST be fully isolated from caller-visible state: no shared mutable descendants, no aliasing that can leak outside the scope, and no observation before finalization. The external contract remains `applyMove(state) -> newState`, where the input `state` is never modified. This guarantee MUST be enforced by regression tests."

This spec implements the Foundation 11 carve-out.

## Proposed Design

### Draft State Wrapper

Introduce a `DraftGameState` that wraps a `GameState` reference and tracks mutations:

```typescript
interface DraftGameState {
  // Read: delegates to the original state or local override
  readonly zones: DraftZoneMap;
  readonly globalVars: DraftVarMap;
  readonly perPlayerVars: DraftPerPlayerVarMap;
  // ... all GameState fields

  // Finalize: produce a new frozen GameState from accumulated mutations
  finalize(): GameState;
}
```

**Key properties:**
- **Copy-on-write zones**: `zones[zoneId]` returns the original array until a mutation targets that zone. On first write, the array is shallow-copied into the draft. Subsequent writes to the same zone mutate the draft copy.
- **Copy-on-write vars**: Global/per-player/zone variables follow the same pattern — original values are read through until a write occurs.
- **Finalization**: Produces a new `GameState` object with only the modified branches replaced. Unmodified branches share references with the original state (structural sharing).
- **Isolation**: The draft is never exposed outside the effect execution scope. The original `GameState` is never modified.

### Integration Points

1. **`applyEffectsWithBudgetState`** (effect-dispatch.ts): Creates a `DraftGameState` at scope entry. All effect handlers receive the draft instead of creating new state copies. On scope exit, calls `draft.finalize()` to produce the output state.

2. **Effect handlers** (effects-token.ts, effects-var.ts, effects-marker.ts, etc.): Change from `return { ...state, zones: { ...state.zones, ... } }` to `draft.zones[zoneId] = newTokens; return draft;`. The handler signature changes from `(state: GameState) => GameState` to `(draft: DraftGameState) => void`.

3. **Read operations** during effect execution: `evalCondition`, `resolveRef`, `evalValue` read from the draft. Since the draft exposes the same `ReadContext` interface (def, state, zones, vars), no changes are needed to the read path — the draft IS the state from the reader's perspective.

4. **Nested scopes**: `forEach`, `if/else`, `let` blocks create nested effect scopes. The draft is threaded through — nested scopes mutate the same draft. This is safe because effect execution is synchronous and single-threaded.

### What Does NOT Change

- **External contract**: `applyMove(state) → newState` remains immutable. Input state is never modified.
- **`ReadContext` interface**: Condition evaluation, value evaluation, reference resolution — all unchanged.
- **GameState serialization**: The finalized state is structurally identical to spread-produced states.
- **Determinism**: Same effects applied in the same order produce identical draft mutations → identical finalized state.
- **Zobrist hashing**: Hash is computed from the finalized state, same as today.

### V8 Optimization Considerations

The draft object has a FIXED shape (same properties as GameState). V8 creates a single hidden class for it. All effect handlers access the same properties on the same type → monomorphic access. This is MORE V8-friendly than the current pattern where spreads create objects with varying property orders.

**Risk**: If the draft object's hidden class differs from `GameState`'s hidden class, and read-path functions receive both types, V8 sees polymorphic call sites → megamorphic deopt. Mitigation: the draft MUST produce objects with identical hidden class to `GameState` during finalization. During execution, the draft should implement the `ReadContext` interface through a proxy or property delegation that V8 can inline.

## Scope

### Mutable
- `packages/engine/src/kernel/effect-dispatch.ts` — scope entry/exit with draft
- `packages/engine/src/kernel/effects-token.ts` — token move/create/remove handlers
- `packages/engine/src/kernel/effects-var.ts` — variable set/add handlers
- `packages/engine/src/kernel/effects-marker.ts` — marker state handlers
- `packages/engine/src/kernel/effects-control.ts` — forEach/if/let scope threading
- `packages/engine/src/kernel/effects-choice.ts` — chooseOne/chooseN handlers
- New file: `packages/engine/src/kernel/draft-state.ts` — DraftGameState implementation
- All tests that assert effect handler return values

### Immutable
- `packages/engine/src/kernel/eval-condition.ts` — reads only, no change
- `packages/engine/src/kernel/eval-value.ts` — reads only, no change
- `packages/engine/src/kernel/resolve-ref.ts` — reads only, no change
- Game spec data (`data/games/*`)

## Testing Strategy

1. **Isolation regression test**: Apply a move, verify the original state is byte-identical before and after (Foundation 11 contract).
2. **Determinism test**: Apply the same move sequence with spread-based and draft-based execution, assert identical finalized states (Foundation 8).
3. **Replay test**: Full game replay produces identical traces with draft execution (Foundation 9).
4. **Benchmark gate**: Draft execution must be faster than spread execution on the FITL 3-seed benchmark. If not, the spec is rejected.

## Expected Impact

10-15% reduction in `combined_duration_ms` on the FITL benchmark. The 15% CPU currently spent on `CreateDataProperty`, `CloneObjectIC`, and GC would be nearly eliminated, replaced by O(modified branches) structural sharing during finalization.
