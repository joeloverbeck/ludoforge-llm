# Spec 65 — Integer-Interned Domain Identifiers

## Status

Archived

## Dependencies

- **Independent of Spec 63** (`archive/specs/63-scoped-draft-state.md`, tickets `63PROFSPR-*`): Archived. Can be implemented in any order.
- **Independent of Spec 64** (`archive/specs/64-compiled-expression-evaluation.md`, tickets `64COMEXPEVA-*`): Archived. If Spec 64 tickets land first, compiled expressions initially use string comparisons; a follow-up pass switches to integer comparisons after this spec lands. If this spec lands first, compiled expressions generate integer comparisons directly. Either order works.

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

## Codebase Status

Existing infrastructure relevant to this spec:

- **`PlayerId` is already `Brand<number, 'PlayerId'>`** (`branded.ts:3`). This serves as proof-of-concept for integer domain IDs. The existing `asPlayerId`/`isPlayerId` constructors already handle numbers. `PlayerId` does NOT need type migration — it just needs an intern table entry for string↔number conversion at I/O boundaries.
- **`eval-query.ts` already uses `String(zoneId)` casts** (lines 519, 829), showing awareness of potential zone ID type changes. These casts will need updating.
- **`compiler.ts` is a 10-line re-export** from `compiler-core.ts`, which is the actual compiler implementation with 89 sub-modules across `packages/engine/src/cnl/`.
- **`TokenTypeId` does not exist as a branded type**. Token types use plain `string` (`tokenType.id`). Creating a branded `TokenTypeId` type is out of scope for this spec.
- **Runner directly imports engine branded types**: `ZoneId`, `ActionId`, `SeatId` are imported in 10 runner files (45 occurrences). The runner is NOT isolated from engine type changes.

### ID Scope

| ID Type | Current | Target | Notes |
|---------|---------|--------|-------|
| `ZoneId` | `Brand<string>` | `Brand<number>` | Phase 1 — highest-frequency lookups |
| `ActionId` | `Brand<string>` | `Brand<number>` | Phase 2 |
| `PhaseId` | `Brand<string>` | `Brand<number>` | Phase 2 |
| `SeatId` | `Brand<string>` | `Brand<number>` | Phase 2 |
| `PlayerId` | `Brand<number>` | `Brand<number>` | Already integer — add intern table entry only |
| `TokenId` | `Brand<string>` | `Brand<string>` | Remains string — unique per-instance, not domain enum |
| `TriggerId` | `Brand<string>` | `Brand<string>` | Remains string — unique per definition, not domain enum |
| `TokenTypeId` | plain `string` | excluded | Not a branded type; creating one is out of scope |

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
- `packages/engine/src/kernel/types-core.ts` — branded type definitions, `GameState.zones` type, `GameDef` (add `InternTable`)
- `packages/engine/src/kernel/branded.ts` — branded type constructors (`asZoneId` etc. change from string to number)
- All kernel modules — ID comparisons change from string to number
- `packages/engine/src/cnl/compiler-core.ts` + sub-modules — intern table generation, ID emission
- `packages/engine/src/sim/` — trace serialization (integer → string at output boundary)
- `packages/engine/src/agents/` — agent decision output
- `packages/runner/src/` — directly imports engine branded types (45 occurrences across 10 files):
  - `canvas/renderers/zone-renderer.ts`, `canvas/renderers/adjacency-renderer.ts`
  - `layout/compute-layout.ts`, `layout/layout-cache.ts`, `layout/layout-helpers.ts`
  - `animation/animation-controller.ts`, `animation/animation-types.ts`, `animation/trace-to-descriptors.ts`, `animation/timeline-builder.ts`
  - `config/validate-visual-config-refs.ts`
- All test files — fixture IDs change type
- All golden fixtures — re-generated with integer IDs
- `packages/engine/schemas/` — schema updates (add `internTable` to GameDef schema)

### Immutable
- Game spec data (`data/games/*`) — specs stay in string IDs
- `docs/FOUNDATIONS.md`

## Migration Strategy

Each phase is independently atomic per Foundation 14 — committed as one change with all tests passing. No string/integer coexistence in any committed state. The phased approach is a development workflow; each phase is a complete, self-consistent migration of a specific ID domain.

### Phase 1: Zone ID Interning (primary win)

**Profiling gate**: Must show measurable improvement on FITL 3-seed benchmark. If not, stop.

- Add `InternTable` type and `GameDef.internTable` field
- Implement intern table generation in `compiler-core.ts`
- Migrate `ZoneId` from `Brand<string>` to `Brand<number>`
- Change `GameState.zones` from `Record<string, Token[]>` to `(readonly Token[])[]`
- Zone indices MUST be contiguous 0-based (0..N-1, no gaps). Compiler assigns indices sequentially.
- Replace `sortAndDedupeZones` (localeCompare) with `dedupeZones` (integer Set dedup)
- Migrate all kernel zone operations, tests, and golden fixtures
- Migrate runner zone access (10 files, 45 occurrences)
- Add `extern`/`intern` functions for zone IDs at serialization boundaries
- Add `PlayerId` entry to intern table (already integer — I/O boundary conversion only)

### Phase 2: Other Domain ID Interning

**Profiling gate**: Must show measurable improvement. If Phase 1 showed no improvement, skip.

- Migrate `ActionId`, `PhaseId`, `SeatId` from `Brand<string>` to `Brand<number>`
- Migrate all kernel, compiler, sim, agent, and runner references
- Update tests and golden fixtures
- Mechanical — same pattern as Phase 1 but smaller scope per type

### Phase 3: Variable Name Interning

**Profiling gate**: Must show measurable improvement. Gated on Phases 1-2 results.

- Migrate `globalVars`, `perPlayerVars`, `zoneVars` from `Map<string, T>` to array-indexed
- Different mechanical pattern from Phases 1-2 (Map → array vs branded type change)
- Update all kernel variable access sites, tests, and fixtures

## Testing Strategy

1. **Roundtrip test**: `intern(extern(id)) === id` for all domain ID types.
2. **Determinism test**: Integer-based execution produces identical game outcomes as string-based (compared via serialized string output).
3. **Benchmark gate**: Integer execution must be faster than string execution on the FITL 3-seed benchmark.
4. **Conformance corpus**: Both FITL and Texas Hold'em must compile, run, and produce valid traces with integer IDs.
5. **No-FITL audit**: No game-specific strings leak into kernel code (existing audit test adapted for integer IDs).

## Expected Impact

- **Phase 1 (Zone IDs)**: 3-5% reduction — zones are the highest-frequency domain lookup. `sortAndDedupeZones` localeCompare (1.38%) eliminated. Zone `Record` → array eliminates megamorphic property access for zones.
- **Phase 2 (Other IDs)**: 2-3% — remaining `StringEqual` (2.12%) and hash lookups reduced.
- **Phase 3 (Variable names)**: 1-2% — `FindOrderedHashMapEntry` (2.52%) partially reduced for variable Maps.
- **Combined**: 6-10% with profiling gates per phase. Each phase stops if no measurable improvement.

## Risk Assessment

**High migration cost, moderate execution risk.** The scope is very large (~200+ files including runner) but the transformation is mechanical (string → number at every ID site). TypeScript's type system catches most errors at compile time. Per-phase profiling gates limit wasted effort.

Specific risks:
- **Integer `Set` iteration order differs from string `Set` iteration order** → determinism must be re-verified via replay tests (Foundation 8, Foundation 16)
- **Integer `0` is falsy in JS** → defensive checks like `if (zoneId)` break for zone index 0. Grep for all bare truthiness checks on ID types and fix to explicit `!== undefined` / `!== -1` checks.
- **JSON serialization of integer IDs produces numbers, not strings** → serialization boundary must be comprehensive. All trace output, runner display, agent traces, and diagnostic messages must use `extern*()` functions.
- **Runner migration** → 10 files, 45 occurrences of engine branded type imports. Layout, rendering, and animation code all directly use `ZoneId`. Must be migrated in the same phase as the engine type change.
- **`String(zoneId)` casts in `eval-query.ts`** (lines 519, 829) → these explicit casts will need updating to direct array index access. They serve as markers for sites that are already "type-aware."
- **V8 JIT sensitivity** → the fitl-perf-optimization campaign demonstrated that V8 aggressively deoptimizes modified kernel functions. Per-phase profiling gates will catch any deoptimization regressions.

## Outcome

- Archived: 2026-04-04
- Phase 1 infrastructure and runtime experiments from `65INTINTDOM-001` through `65INTINTDOM-003` were implemented on corrected Foundation-aligned boundaries, then measured by `65INTINTDOM-006`.
- The corrected profiling gate failed: the preserved FITL baseline median was `120835.42ms`, while the measured post-implementation median was `123340.12ms`, about `+2.07%` slower.
- `perf` inspection did not show a compensating hot-path win strong enough to justify continuing the series.
- The code and generated artifacts introduced by the implemented Phase 1 tickets were rolled back to the pre-`65INTINTDOM` baseline.
- `65INTINTDOM-004` and `65INTINTDOM-005` were already closed as not actionable under the corrected architecture, and `65INTINTDOM-007` through `65INTINTDOM-010` were closed as not implemented after the profiling gate failed.
