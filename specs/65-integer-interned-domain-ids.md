# Spec 65 — Integer-Interned Domain Identifiers

## Status

Proposed

## Dependencies

- **Independent of Spec 63 (Draft State)**: Can be implemented in any order.
- **Should precede or be concurrent with Spec 64 (Compiled Expressions)**: If integer IDs land first, compiled expressions can generate integer comparisons directly, maximizing the combined benefit. If Spec 64 lands first, it would need a follow-up pass to switch from string to integer comparisons.

## Problem

All domain identifiers in the kernel (zone IDs, action IDs, token type IDs, seat IDs, variable names, phase IDs) are branded strings. Every kernel operation — legality checks, state transitions, condition evaluation, zone lookups, token filtering — performs string comparisons via `===`, `Set.has()`, `Map.get()`, `Array.includes()`, and `localeCompare`.

CPU profiling of FITL simulations shows:

| V8 Builtin | % of CPU | Cause |
|------------|----------|-------|
| `Builtins_StringEqual` | 2.12% | String `===` comparisons |
| `Builtins_StringFastLocaleCompare` | 1.38% | Sorted collection ordering |
| `Builtins_FindOrderedHashSetEntry` | 3.15% | `Set.has()` with string keys |
| `Builtins_FindOrderedHashMapEntry` | 2.52% | `Map.get()` with string keys |
| `Builtins_LoadIC_Megamorphic` | 4.98% | Polymorphic property access (partially string-keyed) |
| **Total (direct)** | **~9%** | String-based ID operations |

Additionally, `Builtins_ArrayTimSort` at 1.83% comes from `sortAndDedupeZones` which sorts zone IDs by `localeCompare` — unnecessary with integer IDs (integer sort is trivial).

FITL has ~50 zone IDs (e.g., `kien-giang-an-xuyen:none`, `northeast-cambodia:none`), ~20 action IDs, ~15 token type IDs, and ~4 seat IDs. Each zone ID is 15-30 characters. V8's string comparison is O(length) — integer comparison is O(1).

## FOUNDATIONS Alignment

Foundation 17 (Strongly Typed Domain Identifiers):
> "Domain identifiers (ZoneId, PlayerId, ActionId, TokenTypeId, etc.) MUST be represented as distinct nominal types in implementation code, not interchangeable raw strings."
> "Serialized YAML and JSON artifacts continue to use canonical string representations."

Foundation 17 mandates distinct nominal types but does NOT mandate string representation internally. It explicitly separates internal representation ("implementation code") from external representation ("serialized YAML and JSON artifacts"). Integer-interned IDs satisfy the nominal type requirement through branded number types while keeping string serialization for artifacts.

Foundation 8 (Determinism):
> "Execution MUST NOT depend on ... object key order, hash-map/set iteration order, or any other ambient process state."

Integer IDs make determinism EASIER to enforce. Integer arrays have stable sort order (numeric sort). Integer-keyed Maps iterate in insertion order (same as string-keyed, but faster).

Foundation 14 (No Backwards Compatibility):
> "When a change breaks existing contracts, migrate all owned artifacts in the same change."

This spec requires migrating all GameDef, fixtures, and tests in one change. Foundation 14 explicitly requires this approach.

## Proposed Design

### Compiler: Intern Table Generation

The compiler assigns sequential integer indices to all domain IDs during compilation:

```typescript
interface InternTable {
  readonly zones: readonly string[];      // index → string
  readonly actions: readonly string[];
  readonly tokenTypes: readonly string[];
  readonly seats: readonly string[];
  readonly phases: readonly string[];
  readonly globalVars: readonly string[];
  readonly perPlayerVars: readonly string[];
  readonly zoneVars: readonly string[];
}
```

The `InternTable` is stored in `GameDef.internTable`. All other `GameDef` fields use integer indices instead of string IDs.

### Branded Type Change

```typescript
// Before
export type ZoneId = string & { readonly __brand: 'ZoneId' };

// After
export type ZoneId = number & { readonly __brand: 'ZoneId' };
```

All domain ID types change from branded strings to branded numbers. The TypeScript compiler catches all usage sites.

### Zone Storage

```typescript
// Before (string-keyed object)
interface GameState {
  readonly zones: Readonly<Record<string, readonly Token[]>>;
}

// After (integer-indexed array)
interface GameState {
  readonly zones: readonly (readonly Token[])[];
}
```

Zone access changes from `state.zones['kien-giang-an-xuyen:none']` to `state.zones[42]`. Array index access is monomorphic in V8 (always fast) vs. string property access which can degrade to megamorphic.

### Token Properties

Token `props` that store domain IDs (e.g., `faction: 'VC'`) change to store integer indices. Token filtering predicates compare integers instead of strings.

### Serialization Boundary

The `InternTable` provides reverse mapping for serialization:

```typescript
function externZoneId(id: ZoneId, table: InternTable): string {
  return table.zones[id]!;
}
function internZoneId(name: string, table: InternTable): ZoneId {
  const index = table.zones.indexOf(name);
  if (index === -1) throw new Error(`Unknown zone: ${name}`);
  return index as ZoneId;
}
```

Serialization happens at:
- Trace output (GameTrace → JSON)
- Runner display (state → UI)
- Agent decision traces
- Diagnostic messages

The kernel NEVER converts between string and integer — it operates purely on integers. Conversion only happens at I/O boundaries.

### Sort Elimination

With integer IDs, `sortAndDedupeZones` becomes:
```typescript
function dedupeZones(zones: readonly ZoneId[]): readonly ZoneId[] {
  // Integer dedup via Set is O(n), no sort needed for determinism
  // (integer Set iteration order is insertion order, which is deterministic)
  return [...new Set(zones)];
}
```

The `localeCompare` sort (1.38% CPU) is eliminated entirely. For deterministic ordering, integer natural order suffices.

## Scope

### Mutable (nearly everything)
- `packages/engine/src/kernel/types-core.ts` — branded type definitions
- `packages/engine/src/kernel/branded.ts` — branded type constructors
- All kernel modules — ID comparisons change from string to number
- `packages/engine/src/cnl/compiler.ts` — intern table generation
- `packages/engine/src/cnl/` — all compiler modules that emit IDs
- `packages/engine/src/sim/` — trace serialization
- `packages/engine/src/agents/` — agent decision output
- All test files — fixture IDs change type
- All golden fixtures — re-generated with integer IDs
- `packages/engine/schemas/` — schema updates

### Immutable
- Game spec data (`data/games/*`) — specs stay in string IDs
- `docs/FOUNDATIONS.md`
- `packages/runner/` — consumes serialized string IDs from traces (no change needed if the runner reads from serialized output)

## Migration Strategy

Foundation 14 requires same-change migration. Given the scope (~200+ files), the migration should be:

1. **Phase 1**: Add `InternTable` to `GameDef` and compiler. Both string and integer paths coexist during migration.
2. **Phase 2**: Migrate kernel modules one at a time (zone operations, then token operations, then var operations, etc.). Each module change includes its test updates.
3. **Phase 3**: Remove string-based paths. Delete backwards-compatibility code. Update all remaining fixtures.
4. **Phase 4**: Verify with full test suite + benchmark.

Despite the phased approach, all phases are committed together (Foundation 14: "migrate all owned artifacts in the same change").

## Testing Strategy

1. **Roundtrip test**: `intern(extern(id)) === id` for all domain ID types.
2. **Determinism test**: Integer-based execution produces identical game outcomes as string-based (compared via serialized string output).
3. **Benchmark gate**: Integer execution must be faster than string execution on the FITL 3-seed benchmark.
4. **Conformance corpus**: Both FITL and Texas Hold'em must compile, run, and produce valid traces with integer IDs.
5. **No-FITL audit**: No game-specific strings leak into kernel code (existing audit test adapted for integer IDs).

## Expected Impact

5-9% reduction in `combined_duration_ms`. String comparison (3.5%) is nearly eliminated. Hash-based lookups (5.7%) become faster with integer keys. Sort overhead (1.83%) is eliminated. Megamorphic access (partially string-caused) may also improve as integer-indexed arrays are monomorphic.

## Risk Assessment

**High migration cost, moderate execution risk.** The scope is very large (~200+ files) but the transformation is mechanical (string → number at every ID site). TypeScript's type system catches most errors. The risk is in subtle behavioral differences:
- Integer `Set` iteration order differs from string `Set` iteration order → determinism must be re-verified
- Integer `0` is falsy in JS → defensive checks like `if (zoneId)` break for zone index 0
- JSON serialization of integer IDs produces numbers, not strings → serialization boundary must be comprehensive
