# 106ZONTOKOBS-005: Update `derivePlayerObservation` runtime with observer profile support

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `observation.ts`, `policy-preview.ts`
**Deps**: `archive/tickets/106ZONTOKOBS-001.md`, `specs/106-zone-token-observer-integration.md`

## Problem

`derivePlayerObservation()` currently uses `ZoneDef.visibility` to determine token visibility per zone. With observer profiles gaining zone overrides, the function must accept an optional `CompiledObserverProfile` and resolve effective zone visibility from the observer's zone catalog before falling back to `ZoneDef.visibility`.

## Assumption Reassessment (2026-04-01)

1. `derivePlayerObservation` at `packages/engine/src/kernel/observation.ts:69` — confirmed. Signature: `(def: GameDef, state: GameState, observer: PlayerId) => PlayerObservation`.
2. The function reads `zoneDef.visibility` to determine token filtering — confirmed.
3. `PolicyPreviewDependencies` in `policy-preview.ts` has `derivePlayerObservation?: typeof derivePlayerObservation` — confirmed. Type must be updated.
4. The function is called at `policy-preview.ts:270` — confirmed. Only caller in source.
5. Zone IDs in `ZoneDef` are qualified (`hand:0`, `deck:none`). Base ID is extracted by splitting on `:` — consistent with `compile-zones.ts` conventions.
6. Reveal grants are additive on top of zone visibility — confirmed. Observer overrides replace `ZoneDef.visibility` but grants remain additive.

## Architecture Check

1. Passing resolved `CompiledObserverProfile` (not observer name) keeps `observation.ts` pure — no catalog lookup logic.
2. The new parameter is optional — all existing callers continue to work identically without passing it.
3. Zone visibility resolution follows clear precedence: observer entry > observer `_default` > `ZoneDef.visibility`.
4. Reveal grants remain additive regardless of observer overrides — no behavioral change for grants.

## What to Change

### 1. Update `derivePlayerObservation` signature

Add optional `observerProfile` parameter:

```typescript
export const derivePlayerObservation = (
  def: GameDef,
  state: GameState,
  observer: PlayerId,
  observerProfile?: CompiledObserverProfile,  // NEW
): PlayerObservation
```

### 2. Add zone visibility resolution helper

```typescript
function resolveEffectiveZoneVisibility(
  zoneDef: ZoneDef,
  observerProfile: CompiledObserverProfile | undefined,
): { tokens: 'public' | 'owner' | 'hidden'; order: 'public' | 'owner' | 'hidden' }
```

Resolution order:
1. Extract zone base ID from qualified `ZoneDef.id` (e.g., `hand:0` → `hand`).
2. If `observerProfile?.zones` exists:
   a. Look up `observerProfile.zones.entries[zoneBaseId]`.
   b. If not found, use `observerProfile.zones.defaultEntry`.
   c. If neither found, fall back to `ZoneDef.visibility` for both `tokens` and `order`.
3. If no observer profile or no zone catalog, use `ZoneDef.visibility` for both.

### 3. Refactor token filtering

The existing token filtering logic reads `zoneDef.visibility` directly. Refactor to accept the resolved effective visibility as a parameter instead. Apply `tokens` visibility for token filtering and `order` visibility for order filtering.

Order visibility: only populate `visibleTokenOrderByZone` for `stack`/`queue` zones when `order` visibility permits the observer to see order (same public/owner/hidden semantics as tokens).

### 4. Update `PolicyPreviewDependencies` type

Update the type to accept the optional parameter:

```typescript
readonly derivePlayerObservation?: (
  def: GameDef,
  state: GameState,
  observer: PlayerId,
  observerProfile?: CompiledObserverProfile,
) => PlayerObservation;
```

## Files to Touch

- `packages/engine/src/kernel/observation.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify — type only)

## Out of Scope

- Actually passing observer profiles at call sites (existing callers don't pass it yet — runner integration is follow-up)
- Zone compilation — tickets 003, 004
- Game spec migration — ticket 006

## Acceptance Criteria

### Tests That Must Pass

1. **Behavioral equivalence**: without observer profile, output is identical to current behavior (golden test)
2. Observer profile with `tokens: public` on hidden zone makes all tokens visible
3. Observer profile with `tokens: hidden` on public zone hides all tokens
4. Observer profile with `tokens: owner` on hidden zone shows tokens to owner only
5. `_default` entry applies to unlisted zones
6. Specific entry overrides `_default`
7. Reveal grants still work additively when observer overrides visibility
8. Order visibility: observer says `order: hidden` on stack zone suppresses order output
9. Order visibility: set zone ignores order field entirely
10. `omniscient` profile (with `defaultEntry: { tokens: 'public', order: 'public' }`) makes all zones fully visible

### Invariants

1. `derivePlayerObservation` without observer profile produces byte-identical output to before (Foundation 8, 16)
2. Reveal grants are always additive — never suppressed by observer overrides
3. `observation.ts` has no dependency on `CompiledObserverCatalog` — only on `CompiledObserverProfile`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/observation-observer-profile.test.ts` — observer profile zone override tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern observation` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
