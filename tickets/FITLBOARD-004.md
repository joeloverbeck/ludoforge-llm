# FITLBOARD-004: Faction Color Provider from GameDef

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner only
**Deps**: None (can be done in parallel)

## Problem

`faction-colors.ts` uses a generic FNV-1a hash to assign colors to factions from an 8-color palette. FITL factions (US, ARVN, NVA, VC) get arbitrary colors that don't match the game's canonical color scheme. `GameDef.factions` already contains `FactionDef[]` with `id` and `color` fields (added in the architectural rework), but nothing in the runner reads them.

## What to Change

**File**: `packages/runner/src/canvas/renderers/faction-colors.ts`

### 1. Add `GameDefFactionColorProvider`

```typescript
export class GameDefFactionColorProvider implements FactionColorProvider {
  private readonly colorByFaction: ReadonlyMap<string, string>;
  private readonly fallback: FactionColorProvider;

  constructor(factions: readonly FactionDef[], fallback?: FactionColorProvider) {
    this.colorByFaction = new Map(factions.map(f => [f.id, f.color]));
    this.fallback = fallback ?? new DefaultFactionColorProvider();
  }

  resolveColor(factionId: string | null, playerId: PlayerId): string {
    if (factionId !== null) {
      const color = this.colorByFaction.get(factionId);
      if (color !== undefined) return color;
    }
    return this.fallback.resolveColor(factionId, playerId);
  }
}
```

### 2. Wire into canvas setup

**File**: `packages/runner/src/canvas/canvas-setup.ts` (or wherever the faction color provider is instantiated)

When creating the canvas, pass `gameDef.factions` to construct a `GameDefFactionColorProvider` instead of the bare `DefaultFactionColorProvider`.

### 3. FITL faction data

**File**: `data/games/fire-in-the-lake/40-content-data-assets.md` (or the appropriate FITL spec section)

Ensure the FITL spec includes faction definitions that compile to `GameDef.factions`:

```yaml
factions:
  - id: us
    color: "#e63946"
    displayName: United States
  - id: arvn
    color: "#457b9d"
    displayName: ARVN
  - id: nva
    color: "#2a9d8f"
    displayName: NVA
  - id: vc
    color: "#e9c46a"
    displayName: Viet Cong
```

Check if the compiler already processes a `factions` section; if not, add support.

## Invariants

- `pnpm turbo build` passes
- `pnpm turbo typecheck` passes
- `pnpm turbo lint` passes
- Games without `factions` in GameDef fall back to `DefaultFactionColorProvider` (no regression)
- FITL tokens render with canonical faction colors

## Tests

- **Existing**: All faction-colors tests pass (default provider unchanged)
- **New test**: `GameDefFactionColorProvider` returns `#e63946` for faction `us` when GameDef defines it
- **New test**: `GameDefFactionColorProvider` falls back to `DefaultFactionColorProvider` for unknown factions
- **New test**: `GameDefFactionColorProvider` with empty factions array behaves like default
- `pnpm -F @ludoforge/runner test` — all tests pass
