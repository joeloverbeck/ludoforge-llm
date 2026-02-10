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
- Zobrist key-space generation from canonicalized GameDef features
- Zobrist hash update functions for token placement, variables, and turn/phase/action metadata
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
  readonly algorithm: 'pcg-dxsm-128' | 'xoshiro256ss';
  readonly version: 1;
  readonly state: readonly bigint[];
  // PCG-DXSM: 2 elements [state, increment]
  // xoshiro256**: 4 elements [s0, s1, s2, s3]
}

// Create a new PRNG from a seed
function createRng(seed: bigint): Rng;

// Generate integer in [min, max] inclusive. Returns value and new Rng.
function nextInt(rng: Rng, min: number, max: number): [number, Rng];

// Serialize PRNG state for storage in GameState
function serialize(rng: Rng): RngState;

// Restore PRNG from serialized state
function deserialize(state: RngState): Rng;

// Fork into two independent streams (for lookahead without affecting main game)
function fork(rng: Rng): [Rng, Rng];
```

**Critical**: `nextInt` returns an integer in the closed range `[min, max]`. No floating-point intermediate. Use rejection sampling or modular arithmetic with bias correction to avoid modulo bias.

Validation rules for `nextInt`:
- Throw `RangeError` when `min > max`
- Throw `RangeError` when either bound is not a safe integer
- Throw `RangeError` when `max - min + 1` exceeds `Number.MAX_SAFE_INTEGER`

**`nextFloat` is FORBIDDEN**: The kernel uses integer-only arithmetic. If a uniform selection from N items is needed, use `nextInt(rng, 0, N - 1)`.

### Zobrist Hashing Interface

```typescript
interface ZobristTable {
  readonly seed: bigint;
  readonly fingerprint: string;
}

type ZobristFeature =
  | { kind: 'tokenPlacement'; tokenId: TokenId; zoneId: ZoneId; slot: number }
  | { kind: 'globalVar'; varName: string; value: number }
  | { kind: 'perPlayerVar'; playerId: PlayerId; varName: string; value: number }
  | { kind: 'activePlayer'; playerId: PlayerId }
  | { kind: 'currentPhase'; phaseId: string }
  | { kind: 'turnCount'; value: number }
  | { kind: 'actionUsage'; actionId: string; scope: 'turn' | 'phase' | 'game'; count: number };

// Generate Zobrist table deterministically from GameDef features
function createZobristTable(def: GameDef): ZobristTable;

// Deterministically map a feature tuple to a 64-bit key
function zobristKey(table: ZobristTable, feature: ZobristFeature): bigint;

// Compute full hash of a GameState from scratch
function computeFullHash(table: ZobristTable, state: GameState): bigint;

// Incremental update helper: XOR out previous feature and XOR in next feature
function updateHashFeatureChange(
  hash: bigint,
  table: ZobristTable,
  previous: ZobristFeature,
  next: ZobristFeature
): bigint;

// Convenience wrapper for token move/update operations
function updateHashTokenPlacement(
  hash: bigint,
  table: ZobristTable,
  tokenId: TokenId,
  fromZone: ZoneId,
  fromSlot: number,
  toZone: ZoneId,
  toSlot: number
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

**Algorithm freeze requirement**:
- Choose exactly one algorithm for MVP and freeze it (default: `pcg-dxsm-128`)
- Persist `algorithm` + `version` in serialized RNG state
- Golden vectors must pin behavior for that algorithm/version pair

### Integer Range Generation (No Modulo Bias)

To generate uniform integers in `[min, max]`:
1. Let `range = max - min + 1`
2. Use Lemire's nearly-divisionless method or rejection sampling
3. Never use `value % range` (introduces bias when range doesn't divide 2^64)
4. Convert BigInt result to Number only after range reduction (avoid precision loss)
5. Reject invalid ranges (`min > max`, non-safe bounds, overflowed range) with `RangeError`

### Zobrist Hashing

**Table generation**:
1. Canonicalize relevant GameDef features into a deterministic fingerprint string:
   - Sort and encode zone IDs, action IDs, phase IDs, global/per-player var defs, and declared token types
   - Use stable separators and explicit field names (no JSON object key-order dependence)
2. Derive `table.seed` from this fingerprint (stable 64-bit non-cryptographic hash is sufficient)
3. Use keyed feature hashing (`zobristKey`) so dynamic domains (token IDs, slot indices, action usage counts) do not require precomputed infinite tables
4. Optional memoization cache is allowed, but key derivation must be deterministic and pure

**Incremental updates**:
- Token move/reorder: XOR out old token placement feature (`tokenId`, `fromZone`, `fromSlot`) and XOR in new placement feature (`tokenId`, `toZone`, `toSlot`)
- Variable change: XOR out old feature and XOR in new feature (global/per-player)
- Turn metadata changes (`activePlayer`, `currentPhase`, `turnCount`, `actionUsage` counters): same XOR-out/XOR-in pattern
- Single-field updates remain O(1); bulk effects (for example `shuffle`, `moveAll`) are O(changed-features)

**Full hash computation** (for verification):
- XOR token placement features for every token at every slot in every zone
- XOR global variable features for every global variable
- XOR per-player variable features for every player variable
- XOR scalar state features: `activePlayer`, `currentPhase`, `turnCount`
- XOR action-usage features (`turn`, `phase`, `game` counters)
- Used for initial hash and verification; NOT for per-move updates

**Coverage requirement**:
- Any change that can affect legal move generation, effect evaluation, trigger behavior, or terminal detection must be represented in hash features.
- This explicitly includes token identity and zone order, not only token type/count.

**64-bit representation in JavaScript**:
- Use `BigInt` for Zobrist hashes (native 64-bit support)
- `stateHash` in GameState is `bigint`
- Serialize as hex string for JSON (BigInt is not JSON-serializable)

### Determinism Enforcement Patterns

Provide utility functions / documentation for enforcing determinism across the kernel:

**Forbidden API list** (to be enforced by code review and optionally ESLint rules):
- `Math.random()` - use seedable PRNG
- `Date.now()`, `performance.now()` - no time-dependent behavior
- `Object.keys()`/`Object.entries()` without sorting - unsafe for hash-sensitive iteration
- `JSON.stringify()` for hashing - key order is not a canonical hash contract

**Required patterns**:
- Integer-only arithmetic: `Math.trunc(a / b)` for division
- Sorted iteration: always sort zone IDs, player IDs, var names, action IDs, phase IDs, and any derived key lists before iterating
- Deterministic serialization: use sorted keys when serializing state

## Invariants

1. Same seed always produces same sequence: `nextInt(createRng(42n), 0, 100)` is identical across calls
2. PRNG state is serializable: `deserialize(serialize(rng))` produces identical next values
3. Fork produces independent streams: modifying one fork doesn't affect the other
4. Zobrist hash updates are XOR-incremental and local: single-field updates are O(1)
5. Zobrist hash is deterministic: same GameDef + same state = same hash (regardless of how state was reached)
6. No floating-point arithmetic anywhere in this module
7. `Math.random()` is never called (enforced by review)
8. `nextInt(rng, min, max)` always returns value in `[min, max]` inclusive
9. `nextInt` has no modulo bias (uniform distribution across range)
10. Zobrist table is deterministically derived from GameDef (same def = same table)
11. Token multiplicity is preserved: two same-type tokens in one zone do not cancel in hash
12. Zone ordering differences produce different hashes
13. Changes to `activePlayer`, `currentPhase`, `turnCount`, or `actionUsage` change the hash

## Required Tests

### Unit Tests

- PRNG produces deterministic sequence for seed 42: first 10 values match golden reference
- PRNG produces different sequences for different seeds (seed 42 vs seed 43)
- PRNG serialize/deserialize round-trip: generate 5 values, serialize, deserialize, generate 5 more - matches generating 10 from original
- PRNG fork: fork at step 5, advance both forks 5 steps - sequences differ from each other and from un-forked sequence
- `nextInt(rng, 0, 0)` always returns 0
- `nextInt(rng, 5, 5)` always returns 5
- `nextInt(rng, 0, 1)` returns both 0 and 1 over 100 calls
- `nextInt` invalid inputs (`min > max`, non-safe bounds, overflowed range) throw `RangeError`
- Zobrist: compute full hash, move token A->B with slot change, verify incremental hash matches recomputed full hash
- Zobrist: set variable from 3 to 5, verify incremental hash matches recomputed full hash
- Zobrist: same token multiset but different zone order yields different hash
- Zobrist: two same-type tokens in same zone produce stable non-cancelling hash contribution (distinct token IDs)
- Zobrist: changing activePlayer/phase/actionUsage changes hash and incremental update matches recompute
- Zobrist: two different paths to same state produce same hash
- Zobrist: different states produce different hashes (with high probability)
- Zobrist table for same GameDef always produces identical table
- Zobrist table is identical for semantically equal GameDefs with different declaration order (canonicalization test)

### Integration Tests

- Full determinism test: create GameDef, init state with seed 42, apply 20 random moves using PRNG for agent choices, record state hash at each step. Repeat - hashes match at every step.

### Property Tests

- For any seed and any `(min, max)` where `min <= max`, `nextInt` returns value in `[min, max]`
- For any seed, `deserialize(serialize(createRng(seed)))` produces identical sequence as `createRng(seed)`
- For any valid GameState, `computeFullHash(table, state)` is deterministic (call twice, same result)
- For 1000 random `nextInt(rng, 0, 9)` calls, each value 0-9 appears at least 50 times (rough uniformity check)

### Golden Tests

- Seed 42n -> first 5 `nextInt(rng, 0, 999)` values match hardcoded expected array
- Known GameDef + known state -> expected Zobrist hash value

## Acceptance Criteria

- [ ] PRNG implementation passes all determinism tests
- [ ] PRNG serialize/deserialize round-trip works correctly
- [ ] PRNG fork produces independent streams
- [ ] No floating-point arithmetic in any PRNG or Zobrist code
- [ ] `nextInt` produces uniform distribution (no modulo bias)
- [ ] Zobrist incremental updates match full recomputation
- [ ] Zobrist hash is deterministic for same GameDef + same state
- [ ] Zobrist hash includes token identity + zone order + turn/phase/action metadata
- [ ] All forbidden APIs (`Math.random`, `Date.now`, etc.) are absent from this module
- [ ] Test helpers (`assertDeterministic`, `assertRngRoundTrip`) are exported and documented
- [ ] BigInt serialization to/from JSON works (hex string format)

## Files to Create/Modify

```
src/kernel/prng.ts               # NEW - PRNG implementation (PCG-DXSM or xoshiro256**)
src/kernel/zobrist.ts            # NEW - Zobrist hashing implementation
src/kernel/determinism.ts        # NEW - determinism enforcement utilities and test helpers
src/kernel/index.ts              # MODIFY - re-export PRNG and Zobrist APIs
test/unit/prng.test.ts           # NEW - PRNG unit tests
test/unit/zobrist.test.ts        # NEW - Zobrist hashing tests
test/unit/determinism.test.ts    # NEW - determinism helper tests
test/integration/determinism-full.test.ts  # NEW - full determinism integration test
```
