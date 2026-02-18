# FITLBOARD-004: Faction Color Provider from GameDef

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — generic compiler/data-asset support required
**Deps**: None (can be done in parallel)

## Problem

`packages/runner/src/canvas/renderers/faction-colors.ts` currently uses a generic FNV-1a hash (`DefaultFactionColorProvider`) to assign colors from an 8-color palette. FITL factions (US, ARVN, NVA, VC) therefore get arbitrary colors instead of canonical game colors.

`GameDef` already supports optional `factions: FactionDef[]` (`id`, `color`, optional `displayName`), but current compiler data-asset derivation returns `factions: null` and the runner never consumes `gameDef.factions`.

This ticket must therefore cover both:
- Generic engine pipeline support to derive `GameDef.factions` from YAML data assets (no game-specific logic)
- Runner wiring to prefer `GameDef` faction colors and fall back deterministically when absent

## What to Change

### 1. Add `GameDefFactionColorProvider` in runner

**File**: `packages/runner/src/canvas/renderers/faction-colors.ts`

Implement a provider that:
- Implements `FactionColorProvider` via `getColor(...)` (current interface contract)
- Looks up color by `factionId` from `GameDef.factions`
- Falls back to `DefaultFactionColorProvider` when faction is missing/unknown or no factions defined

```typescript
export class GameDefFactionColorProvider implements FactionColorProvider {
  private readonly colorByFaction: ReadonlyMap<string, string>;
  private readonly fallback: FactionColorProvider;

  constructor(factions: readonly FactionDef[], fallback?: FactionColorProvider) {
    this.colorByFaction = new Map(factions.map(f => [f.id, f.color]));
    this.fallback = fallback ?? new DefaultFactionColorProvider();
  }

  getColor(factionId: string | null, playerId: PlayerId): string {
    if (factionId !== null) {
      const color = this.colorByFaction.get(factionId);
      if (color !== undefined) return color;
    }
    return this.fallback.getColor(factionId, playerId);
  }
}
```

### 2. Wire into current canvas runtime

**File**: `packages/runner/src/canvas/GameCanvas.tsx`

Current instantiation happens in `createGameCanvasRuntime(...)` when creating `tokenRenderer`.
Use a `GameDefFactionColorProvider` instance there and keep it synced with store `gameDef` so color mapping updates when a game is initialized.

### 3. Add generic compiler/data-asset support for factions

**Files**:
- `packages/engine/src/kernel/schemas-gamespec.ts`
- `packages/engine/src/cnl/compile-data-assets.ts`
- Relevant engine tests

Extend piece-catalog payload schema to support optional `factions: FactionDef[]` and propagate selected piece catalog faction definitions into `derivedFromAssets.factions`, so compiler-core includes `gameDef.factions` without game-specific branches.

### 4. FITL faction definitions in YAML

**File**: `data/games/fire-in-the-lake/40-content-data-assets.md`

Add faction definitions inside the FITL piece-catalog payload so they compile to `GameDef.factions`:

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

## Invariants

- `pnpm turbo build` passes
- `pnpm turbo typecheck` passes
- `pnpm turbo lint` passes
- Games without faction definitions still render via `DefaultFactionColorProvider` fallback (no regression)
- FITL tokens render with canonical faction colors

## Tests

- **Runner**:
  - Existing default provider tests remain green
  - New: `GameDefFactionColorProvider` returns configured color for known faction
  - New: unknown/null faction falls back to default provider behavior
  - New: empty faction list behaves like default provider
- **Engine**:
  - New/updated compile test asserts piece-catalog `factions` are emitted as `GameDef.factions`
- Validation:
  - `pnpm -F @ludoforge/engine test` (or targeted equivalent for touched tests)
  - `pnpm -F @ludoforge/runner test`

## Outcome

- **Completion date**: 2026-02-18
- **What changed (actual)**:
  - Added `GameDefFactionColorProvider` in runner and wired it into `createGameCanvasRuntime(...)`.
  - Synced provider state from store `gameDef.factions` and triggered token re-render on faction-color updates.
  - Extended piece-catalog payload schema with optional `factions: FactionDef[]`.
  - Added generic piece-catalog faction invariants (duplicate/undeclared faction references).
  - Propagated selected piece-catalog factions into compiled `GameDef.factions`.
  - Added FITL faction definitions in `data/games/fire-in-the-lake/40-content-data-assets.md`.
  - Added/updated engine and runner tests covering derivation, fallback behavior, and runtime wiring.
- **Deviations from original plan**:
  - Expanded validation beyond minimum pass-through by adding piece-catalog faction integrity diagnostics for robustness.
- **Verification**:
  - `pnpm turbo build` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
