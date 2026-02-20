# SESSMGMT-003: Enrich Bootstrap Manifest and Replace Hardcoded Visual Config (Spec 43 D2)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-002

## Problem

1. The bootstrap manifest (`bootstrap-targets.json`) lacks `name`, `description`, `playerMin`, `playerMax` fields needed by the game selection screen.
2. Visual config resolution in `bootstrap-registry.ts` uses a hardcoded switch (`resolveVisualConfigYaml()`) and explicit imports from `config/visual-config-loader.ts`. Adding a new game requires code changes. The spec requires replacing this with `import.meta.glob` for data-driven discovery.

## What to Change

### 1. `packages/runner/src/bootstrap/bootstrap-targets.json`

Add `name`, `description`, `playerMin`, `playerMax` to each entry:

```json
[
  {
    "id": "default",
    "queryValue": "default",
    "defaultSeed": 42,
    "defaultPlayerId": 0,
    "sourceLabel": "runner bootstrap fixture",
    "fixtureFile": "default-game-def.json",
    "name": "Default Test Game",
    "description": "Minimal game for development testing",
    "playerMin": 2,
    "playerMax": 2
  },
  {
    "id": "fitl",
    "queryValue": "fitl",
    "defaultSeed": 42,
    "defaultPlayerId": 0,
    "sourceLabel": "FITL bootstrap fixture",
    "fixtureFile": "fitl-game-def.json",
    "generatedFromSpecPath": "data/games/fire-in-the-lake",
    "name": "Fire in the Lake",
    "description": "A 4-faction COIN-series wargame set in the Vietnam War",
    "playerMin": 1,
    "playerMax": 4
  },
  {
    "id": "texas",
    "queryValue": "texas",
    "defaultSeed": 42,
    "defaultPlayerId": 0,
    "sourceLabel": "Texas Hold'em bootstrap fixture",
    "fixtureFile": "texas-game-def.json",
    "generatedFromSpecPath": "data/games/texas-holdem",
    "name": "Texas Hold'em",
    "description": "No-limit Texas Hold'em poker tournament",
    "playerMin": 2,
    "playerMax": 10
  }
]
```

### 2. `packages/runner/src/bootstrap/bootstrap-registry.ts`

- Add `name`, `description`, `playerMin`, `playerMax` to `BootstrapTargetDefinition` interface.
- Add `name`, `description`, `playerMin`, `playerMax` to `BootstrapDescriptor` interface.
- Replace the hardcoded `resolveVisualConfigYaml()` function with `import.meta.glob`:

```typescript
const VISUAL_CONFIG_LOADERS = import.meta.glob(
  '../../../data/games/*/visual-config.yaml',
  { query: '?raw', import: 'default' }
) as Record<string, () => Promise<string>>;
```

- Map each bootstrap target's `generatedFromSpecPath` to the glob results to find the matching visual config YAML. Change `resolveVisualConfigYaml` from synchronous to async, returning `Promise<unknown>`.
- Fallback to `null` when no visual config file exists for a game (e.g., the `default` target).
- Remove the `FITL_VISUAL_CONFIG_YAML` and `TEXAS_VISUAL_CONFIG_YAML` imports from the file.
- Update `assertBootstrapTargetDefinitions()` to validate the new fields (`name` is non-empty string, `playerMin`/`playerMax` are positive integers, `playerMin <= playerMax`).
- Update `assertBootstrapRegistry()` to validate the new fields on `BootstrapDescriptor`.

### 3. `packages/runner/src/config/visual-config-loader.ts`

Remove the hardcoded imports and exports:

```typescript
// DELETE these lines:
import fitlVisualConfigYaml from '../../../../data/games/fire-in-the-lake/visual-config.yaml';
import texasVisualConfigYaml from '../../../../data/games/texas-holdem/visual-config.yaml';
export const FITL_VISUAL_CONFIG_YAML: unknown = fitlVisualConfigYaml;
export const TEXAS_VISUAL_CONFIG_YAML: unknown = texasVisualConfigYaml;
```

### 4. Update consumers of the old import pattern

- `packages/runner/src/bootstrap/resolve-bootstrap-config.ts` (or any other file importing `resolveVisualConfigYaml`) must be updated to handle the now-async visual config resolution.

## Files to Touch

- `packages/runner/src/bootstrap/bootstrap-targets.json`
- `packages/runner/src/bootstrap/bootstrap-registry.ts`
- `packages/runner/src/config/visual-config-loader.ts`
- `packages/runner/src/bootstrap/resolve-bootstrap-config.ts`
- Any test files for bootstrap registry validation

## Out of Scope

- Engine type changes (done in SESSMGMT-001)
- Data asset YAML changes (done in SESSMGMT-002)
- Session router (SESSMGMT-004)
- Game selection screen UI (SESSMGMT-006)
- `App.tsx` refactoring (SESSMGMT-004)

## Acceptance Criteria

### Tests That Must Pass

1. **Bootstrap manifest validation**: `assertBootstrapTargetDefinitions()` passes with the new fields for all three entries.
2. **Bootstrap descriptor validation**: `assertBootstrapRegistry()` validates `name`, `description`, `playerMin`, `playerMax` on each descriptor.
3. **`listBootstrapDescriptors()` test**: Returns descriptors with `name`, `description`, `playerMin`, `playerMax` for all entries.
4. **Visual config resolution (FITL)**: `resolveVisualConfigYaml()` for the `fitl` target returns the FITL visual config YAML string.
5. **Visual config resolution (Texas)**: `resolveVisualConfigYaml()` for the `texas` target returns the Texas Hold'em visual config YAML string.
6. **Visual config resolution (default)**: `resolveVisualConfigYaml()` for `default` returns `null` (no visual config file).
7. **Auto-discovery invariant**: If a new `data/games/new-game/visual-config.yaml` exists, it would be discovered via `import.meta.glob` with zero code changes (verified by inspection, not runtime test).
8. **No hardcoded imports**: `FITL_VISUAL_CONFIG_YAML` and `TEXAS_VISUAL_CONFIG_YAML` are no longer exported from `visual-config-loader.ts`.
9. **Existing games still work**: `pnpm -F @ludoforge/runner test` passes. Dev server starts and loads FITL and Texas Hold'em correctly.

### Invariants

1. `BootstrapDescriptor` exposes `name`, `description`, `playerMin`, `playerMax` as required fields.
2. Visual config resolution uses `import.meta.glob` — no game-specific import statements in `bootstrap-registry.ts` or `visual-config-loader.ts`.
3. The `config/index.ts` barrel export still works (even though `FITL_VISUAL_CONFIG_YAML` / `TEXAS_VISUAL_CONFIG_YAML` are removed).
4. Adding a new game's visual config requires only adding a YAML file and a manifest entry — zero code changes.
