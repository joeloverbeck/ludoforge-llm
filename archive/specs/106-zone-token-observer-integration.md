# Spec 106: Zone/Token Observer Integration

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 102 (shared observer model)
**Blocks**: None
**Estimated effort**: 3-5 days

## Problem Statement

Spec 102 establishes the shared observer model for surface-level visibility (globalVars, perPlayerVars, metrics, cards). However, zone/token visibility — which tokens in which zones are visible to which seats — remains a separate system defined per-zone in `ZoneDef.visibility` and computed by `derivePlayerObservation()` in `observation.ts`.

FOUNDATIONS.md #4 states: "players, agents, and runners consume projections of that state according to visibility rules encoded in the spec." Having two disconnected visibility systems violates this principle. Different observers cannot see the same zone differently, and zone visibility is not part of the observer contract.

## Goals

- Add `zones` to the observer profile YAML schema (removing the Spec 102 reserved-key restriction)
- Compile zone visibility overrides per observer into `CompiledZoneVisibilityCatalog`
- Modify `derivePlayerObservation()` to accept a resolved `CompiledObserverProfile` and consult its zone catalog
- Make `ZoneDef.visibility` the default that observer profiles can override
- Enable different observers to see the same zone differently (e.g., `omniscient` sees all tokens, `spectator` sees only public)

## Non-Goals

- Conditional perception rules (e.g., "see hand only at showdown") — future work
- Changing `ZoneDef.visibility` semantics or removing it — it becomes the default
- Runner-side observer enforcement — separate follow-up

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Zone visibility overrides are generic — any game can declare them. No game-specific logic. |
| **2. Evolution-First** | Zone visibility rules live in GameSpecDoc YAML. Evolution can mutate zone visibility per observer. |
| **4. Authoritative State and Observer Views** | **Completes the unification.** Zone/token visibility joins surface visibility under the observer model. One projection model for all clients. |
| **5. One Rules Protocol** | All clients use the same observer to determine zone/token visibility. No per-client zone filtering. |
| **7. Specs Are Data** | Zone visibility overrides are declarative YAML, no code. |
| **8. Determinism** | Static compilation. Same spec = same zone visibility catalog. Same observer profile + same state = same observation. |
| **11. Immutability** | `derivePlayerObservation()` returns new `PlayerObservation` objects, never mutates. |
| **12. Compiler-Kernel Boundary** | Zone ID validation and zone catalog compilation are compiler responsibilities. Runtime resolves from compiled catalog. |
| **14. No Backwards Compatibility** | Games that don't declare zone overrides in observers continue to use `ZoneDef.visibility` as the default — this is the natural resolution path, not a shim. Per Foundation 14, all owned game specs (Texas Hold'em) must be migrated in the same change as the type additions. |
| **16. Testing as Proof** | Behavioral equivalence proven: games without zone overrides produce identical `PlayerObservation`. Observer zone overrides proven via golden tests. |
| **17. Strongly Typed IDs** | Zone base IDs validated at compile time against declared zone definitions. |

## Design

### Part A: YAML Schema Extension

Observer profiles gain an optional `zones` section:

```yaml
observability:
  observers:
    currentPlayer:
      surfaces:
        globalVars: public
        # ... other surface overrides ...
      zones:
        hand:
          tokens: owner       # 'public' | 'owner' | 'hidden'
          order: owner
        deck:
          tokens: hidden
          order: hidden

    omniscientReplay:
      extends: currentPlayer
      surfaces:
        perPlayerVars: public
      zones:
        hand:
          tokens: public
          order: public
        deck:
          tokens: public
          order: public
```

Design rules:
- `zones` is a record keyed by **zone base IDs** (matching `GameSpecZoneDef.id`, e.g., `hand`, `deck`). These are NOT qualified IDs (like `hand:0` or `deck:none`). At runtime, the base ID is extracted from the qualified `ZoneDef.id` by splitting on `:` and taking the first segment.
- Each entry declares `tokens` and `order` visibility: `public | owner | hidden`.
  - `tokens` controls whether tokens in the zone are visible to the observer.
  - `order` controls whether the stacking/queue order of tokens is visible. Only meaningful for `stack` and `queue` zones — `set` zones have no meaningful order.
  - `public`: all seats see tokens/order in this zone.
  - `owner`: only the owning seat sees tokens/order; other seats see the zone exists but not its contents.
  - `hidden`: no seat sees tokens/order (except via reveal grants or the `omniscient` built-in).
- Zones not listed in the observer use `ZoneDef.visibility` as the default.
- A special `_default` key overrides the default for all unlisted zones:
  ```yaml
  zones:
    _default:
      tokens: hidden
      order: hidden
    publicBoard:
      tokens: public
      order: public
  ```
  When `_default` is present, unlisted zones use the `_default` entry instead of `ZoneDef.visibility`.
- **`extends` rules for zones**: Consistent with Spec 102 surface extends semantics:
  - Child inherits all parent zone entries. Child can override specific zones by base ID. Unlisted zones keep the parent's values.
  - Child `_default` replaces parent `_default`.
  - Max depth = 1 (inherited from Spec 102 `extends` constraint).
- The compiler validates that zone base IDs in the observer reference zones that exist in the game spec's zone definitions. Unknown zone base IDs are compilation errors.
- **`owner` on `owner: 'none'` zones**: The compiler emits a warning if an observer declares `tokens: owner` or `order: owner` for a zone with `owner: 'none'`, since there is no owner — the effect is equivalent to `hidden`.
- **`order` on `set` zones**: The compiler emits a warning if an observer declares `order` that differs from `tokens` for a `set`-type zone, since set zones have no meaningful ordering.

### Part B: Compiled Types

```typescript
// New types in types-core.ts

/** Visibility classification for zone tokens and order. */
export type ZoneObserverVisibilityClass = 'public' | 'owner' | 'hidden';

/** Per-zone observer visibility entry. */
export interface CompiledZoneVisibilityEntry {
  readonly tokens: ZoneObserverVisibilityClass;
  readonly order: ZoneObserverVisibilityClass;
}

/**
 * Zone visibility catalog for an observer profile.
 * `entries` is keyed by zone base ID (not qualified ID).
 * `defaultEntry` applies to zones not listed in `entries`.
 */
export interface CompiledZoneVisibilityCatalog {
  readonly entries: Readonly<Record<string, CompiledZoneVisibilityEntry>>;
  readonly defaultEntry?: CompiledZoneVisibilityEntry;
}

// Updated CompiledObserverProfile (from Spec 102)
export interface CompiledObserverProfile {
  readonly fingerprint: string;
  readonly surfaces: CompiledSurfaceCatalog;
  readonly zones?: CompiledZoneVisibilityCatalog;  // NEW — replaces reserved comment
}
```

### Part C: Compilation Pipeline

1. **Modified `compile-observers.ts`**:
   - Remove the reserved-key diagnostic for `zones`.
   - Extend `LowerObserversOptions` with:
     - `knownZoneBaseIds: readonly string[]` — for zone ID validation.
     - `zoneOrderingByBase: Readonly<Record<string, 'stack' | 'queue' | 'set'>>` — for set-zone order warnings.
   - Add zone visibility compilation per observer profile:
     a. Resolve base zones from parent (via `extends`) or empty.
     b. Apply zone overrides: `_default` stored as `defaultEntry`, specific base IDs stored in `entries`.
     c. Per-zone `extends` semantics: child zone entries override per base zone ID; unlisted zones inherited from parent.
   - Built-in `omniscient`: `zones: { entries: {}, defaultEntry: { tokens: 'public', order: 'public' } }`.
   - Built-in `default`: `zones: undefined` (no zone overrides, defers to `ZoneDef.visibility`).
   - Fingerprint includes zone entries (the existing `fingerprintObserverIr` already handles arbitrary objects).

2. **Modified `validate-observers.ts`**:
   - Remove `zones` from `RESERVED_PROFILE_KEYS`.
   - Add `zones` to `OBSERVER_PROFILE_KEYS`.
   - Add `knownZoneBaseIds: ReadonlySet<string>` and `zoneOrderingByBase: Readonly<Record<string, string>>` parameters (either extend `KnownSurfaceIds` or add a new `KnownZoneInfo` parameter).
   - New `validateZones()` function:
     - `zones` must be a record (object).
     - Each key must be `_default` or a known zone base ID. Unknown zone base IDs emit an error diagnostic.
     - Each value must be an object with at least one of `tokens` or `order`.
     - `tokens` and `order` values must be `'public' | 'owner' | 'hidden'`.
     - **Warning**: if zone base has ordering `set` and `order` is explicitly set differently from `tokens`, warn that order is meaningless for set zones.
     - **Warning**: if zone has `owner: 'none'` and entry specifies `tokens: owner` or `order: owner`, warn that owner visibility on non-owned zones is equivalent to hidden.

3. **Modified `compiler-core.ts`**:
   - Pass `knownZoneBaseIds` (extracted from zone compilation results) and `zoneOrderingByBase` to both `validateObservers` and `lowerObservers`.
   - Observer compilation must happen after zone materialization (already the case — zones at ~line 399, observers at ~line 685).

4. **Reveal grant interaction**: Observer zone overrides set the *base visibility class*, replacing `ZoneDef.visibility` for the purpose of `derivePlayerObservation`. Reveal grants remain **additive** on top of the resolved visibility:
   - If observer says `tokens: hidden`, reveal grants can still make individual tokens visible.
   - If observer says `tokens: public`, all tokens are visible regardless of grants.
   - If observer says `tokens: owner`, the owner sees all; non-owners see only via grants.
   This preserves the existing grant semantics without change.

### Part D: Runtime Changes

`derivePlayerObservation()` signature changes:

```typescript
export const derivePlayerObservation = (
  def: GameDef,
  state: GameState,
  observer: PlayerId,
  observerProfile?: CompiledObserverProfile,  // NEW — already resolved by caller
): PlayerObservation
```

The caller (policy-preview, runner, etc.) resolves the observer profile from `GameDef.observers` before calling. This keeps `observation.ts` pure — no catalog lookup logic, no dependency on `CompiledObserverCatalog`.

Resolution order for each zone:
1. Extract the zone base ID from the qualified `ZoneDef.id` (e.g., `hand:0` → `hand`).
2. If `observerProfile?.zones` exists:
   a. Look up `observerProfile.zones.entries[zoneBaseId]`.
   b. If not found, use `observerProfile.zones.defaultEntry`.
   c. If neither found, fall back to `ZoneDef.visibility`.
3. If `observerProfile` is `undefined` or `observerProfile.zones` is `undefined`, use `ZoneDef.visibility` (existing behavior).
4. Use the resolved `tokens` visibility class in place of `ZoneDef.visibility` for token filtering.
5. Use the resolved `order` visibility class for order filtering (only for `stack`/`queue` zones).

All existing callers of `derivePlayerObservation()` that do not pass `observerProfile` continue to work identically — the new parameter is optional. `PolicyPreviewDependencies.derivePlayerObservation` type signature must be updated to accept the optional parameter.

### Part E: Built-In Observer Zone Behavior

The built-in observers from Spec 102 gain implicit zone visibility:

- **`omniscient`**: `zones: { entries: {}, defaultEntry: { tokens: 'public', order: 'public' } }`. The `defaultEntry` overrides `ZoneDef.visibility` for all zones — no need to enumerate zone base IDs.
- **`default`**: `zones: undefined`. No zone overrides. Defers entirely to `ZoneDef.visibility` for each zone. Identical to current behavior.

### Part F: Migration

**FITL**:
- FITL is a perfect-information wargame. All zones are public. No zone overrides needed in the observer — `ZoneDef.visibility` defaults suffice.
- No changes to FITL's observer profile.

**Texas Hold'em**:
- This is where zone/token visibility becomes critical. Texas Hold'em has hidden hands and a hidden deck.
- Add zone visibility to the observer to properly model hidden information:
  ```yaml
  observability:
    observers:
      currentPlayer:
        zones:
          hand:
            tokens: owner
            order: owner
          deck:
            tokens: hidden
            order: hidden
          community:
            tokens: public
            order: public
          burn:
            tokens: hidden
            order: hidden
          muck:
            tokens: hidden
            order: hidden
  ```
- Per FOUNDATIONS.md #14, Texas Hold'em must be migrated in the same change as the type additions. The observability file and game-spec imports must be updated atomically.
- This is the first time Texas Hold'em's hidden information is properly modeled in the observer contract, rather than relying on implicit omniscient defaults.

**Remove Spec 102 reserved-key diagnostic**: The `zones` key in `validate-observers.ts` is no longer reserved — it is implemented.

### Part G: Ticket Breakdown

**106ZONTOKOBS-001: Add zone visibility types to `types-core.ts` and `schemas-core.ts`**
- Add `ZoneObserverVisibilityClass`, `CompiledZoneVisibilityEntry`, `CompiledZoneVisibilityCatalog`.
- Update `CompiledObserverProfile` (remove reserved comment, add optional `zones`).
- Update Zod schemas. Regenerate `GameDef.schema.json`.
- Effort: Small. No behavioral change.

**106ZONTOKOBS-002: Add zone entry types to `game-spec-doc.ts`**
- Add `GameSpecObserverZoneEntryDef`, `GameSpecObserverZonesDef`.
- Update `GameSpecObserverProfileDef` with optional `zones`.
- Effort: Small. No behavioral change.

**106ZONTOKOBS-003: Add zone validation to `validate-observers.ts`**
- Remove `zones` from `RESERVED_PROFILE_KEYS`, add to `OBSERVER_PROFILE_KEYS`.
- Add `validateZones()` function with all validation rules.
- Add `knownZoneBaseIds` and `zoneOrderingByBase` parameter threading.
- Update `compiler-core.ts` to pass zone info to validator.
- Write unit tests.
- Effort: Medium. Deps: 001, 002.

**106ZONTOKOBS-004: Add zone compilation to `compile-observers.ts`**
- Extend `LowerObserversOptions` with `knownZoneBaseIds` and `zoneOrderingByBase`.
- Add zone resolution functions: `resolveBaseZones`, `resolveObserverZones`.
- Build omniscient zones (`defaultEntry`), default zones (`undefined`).
- Update `compiler-core.ts` to pass zone base IDs.
- Write unit tests.
- Effort: Medium. Deps: 001, 002, 003.

**106ZONTOKOBS-005: Update `derivePlayerObservation` runtime**
- Add `observerProfile?: CompiledObserverProfile` parameter.
- Implement zone visibility resolution chain (observer entry > observer `_default` > `ZoneDef.visibility`).
- Refactor token filtering to accept effective visibility.
- Add order visibility logic.
- Update `PolicyPreviewDependencies` type.
- Write unit tests proving behavioral equivalence (no profile = identical output).
- Effort: Medium. Deps: 001.

**106ZONTOKOBS-006: Texas Hold'em migration and integration tests**
- Create Texas Hold'em observability file with zone overrides.
- Update Texas Hold'em game-spec imports.
- Write e2e compilation and runtime tests.
- Effort: Medium. Deps: 003, 004, 005.

**106ZONTOKOBS-007: Diagnostic codes, golden fixtures, and full verification**
- Add new diagnostic codes to `compiler-diagnostic-codes.ts`.
- Update golden test fixtures affected by new observer profile shape.
- Verify full `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`.
- Effort: Small. Deps: all previous.

## Testing

1. **Zone observer compilation**: observers with zone overrides compile correctly
2. **Default fallback**: zones not in observer use `ZoneDef.visibility`
3. **`_default` key**: overrides the default for unlisted zones
4. **Different observers, different zones**: `omniscient` sees all tokens, `currentPlayer` sees only own hand
5. **Extends with zones**: child observer overrides parent's zone visibility per-zone; unlisted zones inherited from parent
6. **Behavioral equivalence**: games without zone overrides in observers produce identical `PlayerObservation` as before
7. **Zone ID validation**: observer referencing non-existent zone base ID fails compilation
8. **Texas Hold'em integration**: hidden hands and deck properly modeled with observer zone visibility
9. **Built-in omniscient zone override**: `omniscient` observer sees all tokens in all zones regardless of `ZoneDef.visibility`
10. **Fingerprint update**: observer fingerprint changes when zone entries are added or modified
11. **Set-zone order warning**: compiler warns when `order` differs from `tokens` for a `set`-type zone
12. **Owner-on-none warning**: compiler warns when `tokens: owner` declared for `owner: 'none'` zone
13. **Reveal grants with overrides**: observer says `tokens: hidden`, reveal grant still reveals specific tokens
14. **Empty zones section**: `zones: {}` compiles to `zones: { entries: {} }`, falls through to `ZoneDef.visibility`

## Migration Checklist

- [ ] Remove `zones` reserved-key diagnostic from `validate-observers.ts`
- [ ] Add zone visibility types to `types-core.ts` (`ZoneObserverVisibilityClass`, `CompiledZoneVisibilityEntry`, `CompiledZoneVisibilityCatalog`)
- [ ] Update `CompiledObserverProfile` in `types-core.ts` (replace reserved comment with `zones` field)
- [ ] Add zone entry types to `game-spec-doc.ts` (`GameSpecObserverZoneEntryDef`, `GameSpecObserverZonesDef`)
- [ ] Update `GameSpecObserverProfileDef` in `game-spec-doc.ts` with `zones` field
- [ ] Add zone validation to `validate-observers.ts`
- [ ] Add zone compilation to `compile-observers.ts`
- [ ] Update `compiler-core.ts` to pass zone info to validator and compiler
- [ ] Update `derivePlayerObservation()` signature and resolution logic in `observation.ts`
- [ ] Update `PolicyPreviewDependencies` type in `policy-preview.ts`
- [ ] Update built-in observer definitions with zone behavior
- [ ] Add Zod schemas to `schemas-core.ts`
- [ ] Add new diagnostic codes to `compiler-diagnostic-codes.ts`
- [ ] Add zone entries to Texas Hold'em observer profile (Foundation 14 compliance)
- [ ] Update Texas Hold'em game-spec imports
- [ ] Update GameDef JSON schema (`pnpm turbo schema:artifacts`)
- [ ] Update all affected tests and golden fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
