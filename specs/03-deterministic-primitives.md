# Spec 03: Deterministic Primitives (PRNG & Zobrist)

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: M
**Dependencies**: Spec 02
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming sections 7.1-7.5

## Overview

Implement the deterministic foundation for the entire kernel: a seedable PRNG and Zobrist-style incremental state hashing. Every random decision in the game engine flows through the PRNG. Every state transition updates the Zobrist hash. Together they guarantee that same seed + same moves = identical results, and enable efficient loop detection and replay verification.

## Scope

### In Scope
- Seedable PRNG implementation (PCG-DXSM preferred, xoshiro256** acceptable fallback)
- PRNG interface: create, nextInt, serialize, deserialize, fork
- Integer-only arithmetic (no floating point in PRNG output)
- Zobrist hashing with 64-bit XOR-based incremental updates
- Zobrist table generation from GameDef feature names
- Zobrist hash update functions for token movement and variable changes
- Determinism enforcement utilities (forbidden API detection helpers)
- Test helpers: `assertDeterministic`, `assertStateRoundTrip`

### Out of Scope
- Integration with GameState (Spec 06 wires PRNG and Zobrist into the game loop)
- Floating-point random numbers (`nextFloat` is FORBIDDEN)
- Cryptographic randomness (not needed for game simulation)
- BigInt performance optimization (address if benchmarks show issues)

## Key Types & Interfaces

### PRNG Interface

```typescript
interface Rng {
  readonly state: RngState;
}

interface RngState {
  readonly state: readonly bigint[];
  // PCG-DXSM: 2 elements [state, increment]
  // xoshiro256**: 4 elements [s0, s1, s2, s3]
}

// Create a new PRNG from a seed
function createRng(seed: bigint): Rng;

// Generate integer in [min, max] inclusive. Returns value and new Rng.
function nextInt(rng: Rng, min: number, max: number): [number, Rng];

// Serialize PRNG state for storage in GameState
function serializeRng(rng: Rng): RngState;

// Restore PRNG from serialized state
function deserializeRng(state: RngState): Rng;

// Fork into two independent streams (for lookahead without affecting main game)
function forkRng(rng: Rng): [Rng, Rng];
```

**Critical**: `nextInt` returns an integer in the closed range `[min, max]`. No floating-point intermediate. Use rejection sampling or modular arithmetic with bias correction to avoid modulo bias.

**`nextFloat` is FORBIDDEN**: The kernel uses integer-only arithmetic. If a uniform selection from N items is needed, use `nextInt(rng, 0, N - 1)`.

### Zobrist Hashing Interface

```typescript
interface ZobristTable {
  readonly tokenZone: Readonly<Record<string, Readonly<Record<string, bigint>>>>;
  // tokenZone[tokenType][zoneId] → random bitstring
  readonly varValue: Readonly<Record<string, readonly bigint[]>>;
  // varValue[varName][value - min] → random bitstring (for bounded integer vars)
}

// Generate Zobrist table deterministically from GameDef features
function createZobristTable(def: GameDef): ZobristTable;

// Compute full hash of a GameState from scratch
function computeFullHash(table: ZobristTable, state: GameState): bigint;

// Incremental update: token moved from one zone to another
function updateHashTokenMove(
  hash: bigint,
  table: ZobristTable,
  tokenType: string,
  fromZone: ZoneId,
  toZone: ZoneId
): bigint;

// Incremental update: variable value changed
function updateHashVarChange(
  hash: bigint,
  table: ZobristTable,
  varName: string,
  oldValue: number,
  newValue: number
): bigint;
```

### Test Helpers

```typescript
// Asserts that calling fn with the same seed produces identical results
function assertDeterministic<T>(
  fn: (rng: Rng) => T,
  seed: bigint,
  compare?: (a: T, b: T) => boolean
): void;

// Asserts that serialize/deserialize round-trip preserves RNG behavior
function assertRngRoundTrip(rng: Rng, steps: number): void;

// Asserts that state round-trips through serialize/deserialize
function assertStateRoundTrip(state: GameState): void;
```

## Implementation Requirements

### PRNG: PCG-DXSM (Preferred)

PCG-DXSM (Permuted Congruential Generator, DXSM output function):
- State: 128-bit (two 64-bit values: state + increment)
- Output: 64-bit
- Period: 2^128
- Properties: fast, statistically strong, compact state, well-analyzed

Implementation notes:
- Use `BigInt` for 128-bit state arithmetic
- The increment must be odd (enforced at creation)
- DXSM output function: `hi ^ (hi >> 32)` with multiplication, provides better distribution than XSH-RR

If PCG-DXSM proves too complex for BigInt performance, fall back to xoshiro256**:
- State: 256-bit (four 64-bit values)
- Output: 64-bit
- Period: 2^256 - 1
- Caveat: weak low-order bits (use upper bits for range reduction)

### Integer Range Generation (No Modulo Bias)

To generate uniform integers in `[min, max]`:
1. Let `range = max - min + 1`
2. Use Lemire's nearly-divisionless method or rejection sampling
3. Never use `value % range` (introduces bias when range doesn't divide 2^64)
4. Convert BigInt result to Number only after range reduction (avoid precision loss)

### Zobrist Hashing

**Table generation**:
1. Create a separate PRNG from a seed derived from GameDef feature names (e.g., hash of sorted token type IDs + zone IDs + var names)
2. For each `(tokenType, zoneId)` pair: generate a random 64-bit bitstring
3. For each `(varName, possibleValue)` pair: generate a random 64-bit bitstring
4. Store in ZobristTable

**Incremental updates**:
- Token move from zone A to zone B: `hash ^= table.tokenZone[type][A] ^ table.tokenZone[type][B]`
- Variable change from old to new: `hash ^= table.varValue[name][old - min] ^ table.varValue[name][new - min]`
- Both are O(1) operations

**Full hash computation** (for verification):
- XOR all active `(tokenType, zoneId)` bitstrings for every token in every zone
- XOR all `(varName, currentValue)` bitstrings for every variable
- Used for initial hash and verification; NOT for per-move updates

**64-bit representation in JavaScript**:
- Use `BigInt` for Zobrist hashes (native 64-bit support)
- `stateHash` in GameState is `bigint`
- Serialize as hex string for JSON (BigInt is not JSON-serializable)

### Determinism Enforcement Patterns

Provide utility functions / documentation for enforcing determinism across the kernel:

**Forbidden API list** (to be enforced by code review and optionally ESLint rules):
- `Math.random()` — use seedable PRNG
- `Date.now()`, `performance.now()` — no time-dependent behavior
- `Map`/`Set` iteration in critical paths — use sorted arrays
- `Object.keys()`/`Object.entries()` without sorting — property order not guaranteed for integer-like keys
- `JSON.stringify()` for hashing — key order not guaranteed

**Required patterns**:
- Integer-only arithmetic: `Math.trunc(a / b)` for division
- Sorted iteration: always sort arrays of zone IDs, player IDs before iterating
- Deterministic serialization: use sorted keys when serializing state

## Invariants

1. Same seed always produces same sequence: `nextInt(createRng(42n), 0, 100)` is identical across calls
2. PRNG state is serializable: `deserializeRng(serializeRng(rng))` produces identical next values
3. Fork produces independent streams: modifying one fork doesn't affect the other
4. Zobrist hash updates are O(1): single XOR out + XOR in per token move or var change
5. Zobrist hash is deterministic: same GameDef + same state = same hash (regardless of how state was reached)
6. No floating-point arithmetic anywhere in this module
7. `Math.random()` is never called (enforced by review)
8. `nextInt(rng, min, max)` always returns value in `[min, max]` inclusive
9. `nextInt` has no modulo bias (uniform distribution across range)
10. Zobrist table is deterministically derived from GameDef (same def = same table)

## Required Tests

### Unit Tests

- PRNG produces deterministic sequence for seed 42: first 10 values match golden reference
- PRNG produces different sequences for different seeds (seed 42 vs seed 43)
- PRNG serialize/deserialize round-trip: generate 5 values, serialize, deserialize, generate 5 more — matches generating 10 from original
- PRNG fork: fork at step 5, advance both forks 5 steps — sequences differ from each other and from un-forked sequence
- `nextInt(rng, 0, 0)` always returns 0
- `nextInt(rng, 5, 5)` always returns 5
- `nextInt(rng, 0, 1)` returns both 0 and 1 over 100 calls
- Zobrist: compute full hash, move token A→B, verify incremental hash matches recomputed full hash
- Zobrist: set variable from 3 to 5, verify incremental hash matches recomputed full hash
- Zobrist: two different paths to same state produce same hash (move A→B→C vs move A→C then token appears)
- Zobrist: different states produce different hashes (with high probability)
- Zobrist table for same GameDef always produces identical table

### Integration Tests

- Full determinism test: create GameDef, init state with seed 42, apply 20 random moves using PRNG for agent choices, record state hash at each step. Repeat — hashes match at every step.

### Property Tests

- For any seed and any `(min, max)` where `min <= max`, `nextInt` returns value in `[min, max]`
- For any seed, `deserializeRng(serializeRng(createRng(seed)))` produces identical sequence as `createRng(seed)`
- For any valid GameState, `computeFullHash(table, state)` is deterministic (call twice, same result)
- For 1000 random `nextInt(rng, 0, 9)` calls, each value 0-9 appears at least 50 times (rough uniformity check)

### Golden Tests

- Seed 42n → first 5 `nextInt(rng, 0, 999)` values match hardcoded expected array
- Known GameDef + known state → expected Zobrist hash value

## Acceptance Criteria

- [ ] PRNG implementation passes all determinism tests
- [ ] PRNG serialize/deserialize round-trip works correctly
- [ ] PRNG fork produces independent streams
- [ ] No floating-point arithmetic in any PRNG or Zobrist code
- [ ] `nextInt` produces uniform distribution (no modulo bias)
- [ ] Zobrist incremental updates match full recomputation
- [ ] Zobrist hash is deterministic for same GameDef + same state
- [ ] All forbidden APIs (`Math.random`, `Date.now`, etc.) are absent from this module
- [ ] Test helpers (`assertDeterministic`, `assertRngRoundTrip`) are exported and documented
- [ ] BigInt serialization to/from JSON works (hex string format)

## Files to Create/Modify

```
src/kernel/prng.ts               # NEW — PRNG implementation (PCG-DXSM or xoshiro256**)
src/kernel/zobrist.ts            # NEW — Zobrist hashing implementation
src/kernel/determinism.ts        # NEW — determinism enforcement utilities and test helpers
src/kernel/index.ts              # MODIFY — re-export PRNG and Zobrist APIs
test/unit/prng.test.ts           # NEW — PRNG unit tests
test/unit/zobrist.test.ts        # NEW — Zobrist hashing tests
test/unit/determinism.test.ts    # NEW — determinism helper tests
test/integration/determinism-full.test.ts  # NEW — full determinism integration test
```
