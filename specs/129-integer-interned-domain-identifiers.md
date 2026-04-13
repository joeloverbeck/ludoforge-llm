# Spec 129: Integer-Interned Domain Identifiers

**Status**: PROPOSED
**Priority**: P1
**Complexity**: XL
**Dependencies**: None (standalone, but benefits compound with Spec 128)
**Source**: `fitl-perf-optimization` campaign V8 profiling data (2026-04-13), global lessons from 5 prior perf campaigns

## Overview

Replace string-based domain identifiers (ActionId, ZoneId, TokenTypeId, etc.) with integer indices inside the compiled GameDef and kernel runtime. String identifiers are preserved in the GameSpecDoc/compilation input layer and in serialized output; the interning happens at the GameDef → kernel boundary.

### Rationale

V8 CPU profiling of FITL shows that string operations are a systemic cost:

| V8 Builtin | CPU % | Cause |
|-----------|-------|-------|
| `StringEqual` | 1.3% | String `===` comparisons in ID lookups |
| `StringFastLocaleCompare` | 1.0% | String ordering for canonical move keys |
| `StringConstructor` | 1.1% | `String(move.actionId)` conversions |
| `FindOrderedHashMapEntry` | 1.7% | `Map<string, V>.get()` hash lookups |
| `FindOrderedHashSetEntry` | 1.0% | `Set<string>.has()` hash lookups |
| **Total** | **~6%** | |

Additionally, `toMoveIdentityKey` (called ~4000 times per game) uses `JSON.stringify(move.params)` to serialize parameter objects into string keys. With FITL moves having up to 20 parameters (4640 chars JSON), this is a significant hidden cost.

Five performance campaigns confirmed that **caching string lookups causes V8 deoptimization** — WeakMap caches on hot-path objects cause 2-5% regression. And **modifying kernel function internals is unsafe** — any change to the resolveRef/evalCondition/evalQuery dispatch chains causes V8 JIT regression. Integer interning addresses the root cause rather than papering over the string cost.

### Foundation 17 Alignment

Foundation 17 (Strongly Typed Domain Identifiers) requires:

> *"Domain identifiers MUST be represented as distinct nominal types in implementation code, not interchangeable raw strings."*

Currently, identifiers are branded strings (e.g., `ActionId = string & { __brand: 'ActionId' }`). Integer-interned identifiers are **strictly stronger** than branded strings:

- Integer indices are inherently non-interchangeable (an `ActionIndex` of 3 has no meaning in the `ZoneIndex` domain)
- Compile-time type safety is preserved (branded integers)
- Runtime validation is faster (bounds check vs string lookup)
- Serialization/deserialization is explicit (the intern table is the source of truth)

### Performance Model

String-to-integer conversion eliminates cost at every comparison and lookup:

| Operation | String cost | Integer cost | Improvement |
|-----------|------------|--------------|-------------|
| `actionId === targetId` | O(n) string compare | O(1) integer compare | ~10x for typical IDs |
| `Map<string, V>.get(id)` | Hash + bucket scan + string compare | Array index `defs[index]` | ~5x (no hashing) |
| `Set<string>.has(id)` | Hash + probe + compare | Bitfield check or array bounds | ~5x |
| `toMoveIdentityKey` | `JSON.stringify(params)` | Integer tuple → packed integer | ~50x (no serialization) |
| `stableMoveKey.localeCompare` | O(n) string compare | O(1) integer compare | ~10x |

## Deliverables

### 1. Intern Table Compilation

Add an interning phase to the GameSpecDoc → GameDef compilation pipeline. The compiler assigns a dense integer index (0-based) to each domain identifier:

```typescript
interface InternTable {
  readonly actions: readonly string[];     // index → string ID
  readonly zones: readonly string[];       // index → string ID
  readonly tokenTypes: readonly string[];  // index → string ID
  readonly seats: readonly string[];       // index → string ID
  readonly phases: readonly string[];      // index → string ID
  readonly markers: readonly string[];     // index → string ID
  readonly globalMarkers: readonly string[];
  readonly variables: readonly string[];   // global + per-player var names
}
```

The table is stored in the compiled GameDef. Reverse lookup (string → index) is available during compilation and at runtime via `Map<string, number>`.

### 2. Branded Integer Types

Replace branded string types with branded integer types:

```typescript
// Before
export type ActionId = string & { readonly __brand: 'ActionId' };

// After
export type ActionIndex = number & { readonly __brand: 'ActionIndex' };
```

All kernel interfaces (`ActionDef`, `ZoneDef`, `Move`, `GameState`) use integer indices internally. The intern table maps between internal indices and external string IDs.

### 3. Array-Indexed Lookups

Replace `Map<string, V>` with array indexing where the key is a domain identifier:

```typescript
// Before
const action = def.actions.find(a => a.id === actionId);
// or
const action = actionMap.get(actionId);

// After
const action = def.actions[actionIndex]; // O(1) direct access
```

This eliminates `FindOrderedHashMapEntry` (1.7% CPU) for domain ID lookups.

### 4. Integer-Based Move Identity Keys

Replace `toMoveIdentityKey` (JSON.stringify-based) with integer-based key computation:

```typescript
// Before
const key = [String(move.actionId), JSON.stringify(move.params), ...].join('|');

// After
// Move params are already resolved to integer indices at compilation.
// Key = packed integer or integer tuple, comparison is O(1).
const key = packMoveKey(move.actionIndex, move.resolvedParamIndices);
```

This eliminates `JSON.stringify` overhead (~4000 calls per game, some producing 4KB+ strings for FITL sweep moves).

### 5. Serialization Boundary

The intern table provides the string ↔ integer mapping at system boundaries:

- **Input** (GameSpecDoc → compiler): String IDs in YAML are mapped to integers during compilation
- **Output** (traces, replays, UI): Integer indices are mapped back to string IDs when serializing for human consumption
- **Internal** (kernel, simulator, agents): All operations use integer indices exclusively

This preserves Foundation 9 (Replay and Auditability) — traces contain human-readable string IDs. The mapping is lossless and deterministic.

### 6. GameState Zone/Variable Storage

Replace string-keyed records with array-indexed storage:

```typescript
// Before
interface GameState {
  readonly zones: Readonly<Record<string, readonly Token[]>>;
  readonly globalVars: Readonly<Record<string, unknown>>;
  readonly perPlayerVars: Readonly<Record<number, Readonly<Record<string, unknown>>>>;
}

// After
interface GameState {
  readonly zones: readonly (readonly Token[])[];          // indexed by ZoneIndex
  readonly globalVars: readonly unknown[];                // indexed by VarIndex
  readonly perPlayerVars: readonly (readonly unknown[])[]; // indexed by [PlayerIndex][VarIndex]
}
```

This eliminates `Object.entries(state.zones)` iterations (which create temporary arrays) and replaces them with direct index loops.

## Constraints

1. **Foundation 8 (Determinism)**: Integer indices are assigned deterministically during compilation (sorted by string ID, then assigned 0, 1, 2...). Same GameSpecDoc always produces the same intern table. Verified by existing determinism tests.

2. **Foundation 1 (Engine Agnosticism)**: The interning is generic — it works for any game's identifiers. No game-specific logic in the intern table construction.

3. **Foundation 14 (No Backwards Compatibility)**: All GameDef consumers (kernel, simulator, agents, runner, tests) are migrated in the same change. No compatibility shim for string-based access.

4. **Foundation 2 (Evolution-First)**: The intern table is part of the compiled GameDef. When evolution mutates YAML, recompilation produces a new intern table. The indices are internal — they don't appear in GameSpecDoc.

5. **Foundation 9 (Replay and Auditability)**: Traces and replays use the intern table to serialize integer indices back to human-readable string IDs. The trace format is unchanged from the consumer's perspective.

## Risk Assessment

**Very high complexity, very high reward.** This change touches every file that uses domain identifiers — likely 50+ source files and 100+ test files. The migration must be atomic (Foundation 14 — no compatibility layer).

**Suggested implementation order**:
1. Define branded integer types and InternTable interface
2. Add intern table construction to the compiler
3. Migrate `ActionId` first (most impactful — used in legal moves, apply move, agent evaluation)
4. Migrate `ZoneId` (second most impactful — used in spatial queries, token operations)
5. Migrate remaining domains
6. Convert `toMoveIdentityKey` to integer-based keys
7. Convert `GameState` zone/variable storage to arrays
8. Benchmark after each domain migration

## Expected Impact

- **Target**: 4-6% reduction in `combined_duration_ms` (eliminating ~6% string operation CPU, minus overhead from intern table lookups at boundaries)
- **Compound with Spec 128**: Array-indexed GameState (Deliverable 6) synergizes with draft state mutations — array index assignment is faster than record property assignment
- **Measurement**: `fitl-perf-optimization` campaign harness
- **Validation**: all existing tests pass + stateHash determinism preserved
