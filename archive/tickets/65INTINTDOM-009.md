# 65INTINTDOM-009: Variable name interning (globalVars, perPlayerVars, zoneVars)

**Status**: 🚫 NOT IMPLEMENTED
**Priority**: LOW
**Effort**: Large
**Engine Changes**: Yes — types-core.ts (GameState variable storage types), all kernel variable access sites
**Deps**: `archive/tickets/65INTINTDOM-008.md`

## Problem

`GameState.globalVars`, `GameState.perPlayerVars`, and `GameState.zoneVars` use `Map<string, T>` or `Record<string, T>` with string variable names as keys. String-keyed Map lookups contribute to `Builtins_FindOrderedHashMapEntry` (2.52% CPU). Interning variable names to integer indices and using array-indexed storage eliminates this overhead.

## Assumption Reassessment (2026-04-03)

1. Variable names are NOT branded types — they're plain strings used as Map/Record keys in `GameState`.
2. `InternTable` from ticket 001 already has `globalVars`, `perPlayerVars`, `zoneVars` arrays for interning.
3. This is a different mechanical pattern from branded ID migration (Phases 1-2): Map<string, T> → array-indexed, rather than branded string → branded number.
4. Variable access patterns in the kernel use `state.globalVars.get(varName)` or similar Map API — these change to array index access.

## Architecture Check

1. Variable name interning follows the same architectural principle as ID interning — compile-time index assignment, runtime integer access, string conversion at I/O boundaries only.
2. Foundation 2 (Evolution-First) preserved — variable names in GameSpecDoc YAML remain strings. The compiler assigns integer indices.
3. Foundation 8 (Determinism) preserved — intern table variable indices are deterministically sorted alphabetically.
4. Foundation 11 (Immutability) preserved — array-indexed variables use `readonly` arrays, same immutable update patterns as before.

## What to Change

### 1. Change `GameState` variable storage types

```typescript
// Before
readonly globalVars: Readonly<Record<string, number>>;
readonly perPlayerVars: ReadonlyMap<string, Readonly<Record<string, number>>>;
readonly zoneVars: ReadonlyMap<string, Readonly<Record<string, number>>>;

// After (conceptual — exact type depends on current shape)
readonly globalVars: readonly number[];
readonly perPlayerVars: readonly (readonly number[])[];  // indexed by PlayerId
readonly zoneVars: readonly (readonly number[])[];       // indexed by ZoneId
```

The exact type transformation depends on the current `GameState` shape — verify before implementing.

### 2. Update all kernel variable access sites

Replace `state.globalVars[varName]` or `state.globalVars.get(varName)` with `state.globalVars[varIndex]` where `varIndex` is the interned integer index.

### 3. Update compiler variable emission

Compiler modules that emit variable references use intern table lookups to produce integer indices.

### 4. Update serialization boundaries

Extend extern/intern pattern to variable names in traces, diagnostics, and error messages.

### 5. Update tests and fixtures

All tests constructing or querying GameState variables update to integer-indexed access.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify) — variable storage types in GameState
- All kernel modules accessing `state.globalVars`, `state.perPlayerVars`, `state.zoneVars` (modify)
- `packages/engine/src/cnl/` (modify) — compiler variable reference emission
- `packages/engine/src/sim/` (modify) — trace serialization for variable names
- `packages/engine/src/kernel/intern.ts` (modify) — add variable name extern/intern functions
- All test files and golden fixtures (modify)

## Out of Scope

- Branded type migrations (completed in Phases 1-2)
- Runner variable display (runner consumes serialized traces with string variable names)

## Acceptance Criteria

### Tests That Must Pass

1. All variable access uses integer indices — no string key lookups remain
2. Serialized traces show human-readable variable names (via extern)
3. Determinism test: same GameDef + seed produces identical game outcome
4. FITL and Texas Hold'em compile, run, and produce valid traces
5. Existing suite: `pnpm turbo test`

### Invariants

1. Variable arrays are contiguous 0-based (0..N-1)
2. Variable name intern table entries are sorted alphabetically (deterministic)
3. No string-keyed Map or Record operations for variable access in kernel hot paths

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/intern.test.ts` — add roundtrip tests for variable name interning
2. All variable-related kernel tests — update from string keys to integer indices
3. Determinism replay test — verify identical output after variable interning

### Commands

1. `pnpm turbo typecheck`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`

## Outcome

Completed: 2026-04-04

This ticket was closed because `65INTINTDOM-006` failed the corrected Phase 1 profiling gate, so the remaining Phase 2 and Phase 3 migration work was not justified.
