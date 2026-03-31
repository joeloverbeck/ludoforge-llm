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
- Modify `derivePlayerObservation()` to accept an observer name and consult the observer catalog
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
| **8. Determinism** | Static compilation. Same spec = same zone visibility catalog. |
| **12. Compiler-Kernel Boundary** | Zone visibility compilation is a compiler responsibility. Runtime resolves from compiled catalog. |
| **14. No Backwards Compatibility** | Games that don't declare zone overrides in observers continue to use `ZoneDef.visibility` as the default — this is the natural resolution path, not a shim. |
| **16. Testing as Proof** | Behavioral equivalence proven: games without zone overrides produce identical `PlayerObservation`. |

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
- `zones` is a record keyed by zone ID.
- Each entry declares `tokens` and `order` visibility: `public | owner | hidden`.
  - `public`: all seats see all tokens and their order in this zone.
  - `owner`: only the owning seat sees tokens and order; other seats see the zone exists but not its contents.
  - `hidden`: no seat sees tokens or order (except via the `omniscient` built-in).
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
- `extends` applies to zones: child zone entries override parent's zone entries per-zone (not merged — full replacement per zone ID).
- The compiler validates that zone IDs in the observer reference zones that exist in the game spec's zone definitions.

### Part B: Compiled Types

```typescript
interface CompiledZoneVisibilityEntry {
  readonly tokens: 'public' | 'owner' | 'hidden';
  readonly order: 'public' | 'owner' | 'hidden';
}

interface CompiledZoneVisibilityCatalog {
  readonly entries: Readonly<Record<string, CompiledZoneVisibilityEntry>>;
  readonly defaultEntry?: CompiledZoneVisibilityEntry;  // for zones not listed
}

// Extended CompiledObserverProfile (from Spec 102)
interface CompiledObserverProfile {
  readonly fingerprint: string;
  readonly surfaces: CompiledSurfaceCatalog;
  readonly zones?: CompiledZoneVisibilityCatalog;  // NEW
}
```

### Part C: Compilation Pipeline

1. **Modified `compile-observers.ts`**:
   - Remove the reserved-key diagnostic for `zones`
   - Add zone visibility compilation: validate zone IDs, expand `_default`, resolve `extends` for zones
   - Zone visibility entries use the same shorthand pattern as surfaces where applicable
   - Fingerprint includes zone entries

2. **Modified `validate-observers.ts`**:
   - Validate zone IDs reference existing zone definitions
   - Validate `tokens` and `order` values are valid visibility classes
   - Validate `_default` entry structure

### Part D: Runtime Changes

`derivePlayerObservation()` signature changes:

```typescript
export const derivePlayerObservation = (
  def: GameDef,
  state: GameState,
  observer: PlayerId,
  observerProfileName?: string,  // NEW — key into def.observers
): PlayerObservation
```

Resolution order for each zone:
1. If `observerProfileName` is provided and `def.observers` exists, look up the observer profile
2. If the observer profile has a zone entry for this zone ID, use it
3. If the observer profile has a `defaultEntry`, use it
4. Otherwise fall back to `ZoneDef.visibility` (existing behavior — preserves backward compatibility without a shim)

All existing callers of `derivePlayerObservation()` that do not pass `observerProfileName` continue to work identically — the new parameter is optional.

### Part E: Built-In Observer Zone Behavior

The built-in observers from Spec 102 gain implicit zone visibility:

- **`omniscient`**: All zones `{ tokens: 'public', order: 'public' }`. Overrides `ZoneDef.visibility` for all zones.
- **`default`**: No zone overrides. Defers entirely to `ZoneDef.visibility` for each zone. Identical to current behavior.

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
        surfaces:
          # ... surface overrides ...
        zones:
          hand:
            tokens: owner
            order: owner
          deck:
            tokens: hidden
            order: hidden
          communityCards:
            tokens: public
            order: public
  ```
- This is the first time Texas Hold'em's hidden information is properly modeled in the observer contract, rather than relying on implicit omniscient defaults.

**Remove Spec 102 reserved-key diagnostic**: The `zones` key is no longer reserved — it is implemented.

## Testing

1. **Zone observer compilation**: observers with zone overrides compile correctly
2. **Default fallback**: zones not in observer use `ZoneDef.visibility`
3. **`_default` key**: overrides the default for unlisted zones
4. **Different observers, different zones**: `omniscient` sees all tokens, `currentPlayer` sees only own hand
5. **Extends with zones**: child observer overrides parent's zone visibility per-zone
6. **Behavioral equivalence**: games without zone overrides in observers produce identical `PlayerObservation` as before
7. **Zone ID validation**: observer referencing non-existent zone ID fails compilation
8. **Texas Hold'em integration**: hidden hands and deck properly modeled with observer zone visibility
9. **Built-in omniscient zone override**: `omniscient` observer sees all tokens in all zones regardless of `ZoneDef.visibility`
10. **Fingerprint update**: observer fingerprint changes when zone entries are added or modified

## Migration Checklist

- [ ] Remove `zones` reserved-key diagnostic from `compile-observers.ts`
- [ ] Add zone visibility types to `types-core.ts`
- [ ] Add zone compilation to `compile-observers.ts`
- [ ] Add zone validation to `validate-observers.ts`
- [ ] Update `derivePlayerObservation()` signature and resolution logic
- [ ] Update built-in observer definitions with zone behavior
- [ ] Add zone entries to Texas Hold'em observer profile
- [ ] Update Zod schemas in `schemas-core.ts`
- [ ] Update GameDef JSON schema
- [ ] Update all affected tests and fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
