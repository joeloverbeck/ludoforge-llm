# SESSMGMT-002: Add Metadata to Game Data Assets and Bootstrap Fixtures (Spec 43 D0 cont.)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only changes in YAML and JSON fixtures
**Deps**: SESSMGMT-001

## Problem

After SESSMGMT-001 adds the `name`/`description` fields to the engine types, the production game specs and bootstrap fixture JSONs need to be updated to include them so the game selection screen can display human-readable game info.

## What to Change

### 1. `data/games/fire-in-the-lake/*.md` — metadata YAML block

Find the metadata YAML block in the FITL production spec and add `name` and `description`:

```yaml
metadata:
  id: fire-in-the-lake
  name: "Fire in the Lake"
  description: "A 4-faction COIN-series wargame set in the Vietnam War"
  players:
    min: 1
    max: 4
```

### 2. `data/games/texas-holdem/*.md` — metadata YAML block

Same pattern:

```yaml
metadata:
  id: texas-holdem
  name: "Texas Hold'em"
  description: "No-limit Texas Hold'em poker tournament"
  players:
    min: 2
    max: 10
```

### 3. `packages/runner/src/bootstrap/fitl-game-def.json`

Add `name` and `description` to the `metadata` object:

```json
"metadata": {
  "id": "fire-in-the-lake",
  "name": "Fire in the Lake",
  "description": "A 4-faction COIN-series wargame set in the Vietnam War",
  ...
}
```

### 4. `packages/runner/src/bootstrap/texas-game-def.json`

Same pattern:

```json
"metadata": {
  "id": "texas-holdem",
  "name": "Texas Hold'em",
  "description": "No-limit Texas Hold'em poker tournament",
  ...
}
```

### 5. `packages/runner/src/bootstrap/default-game-def.json`

Add metadata fields for the default test game:

```json
"metadata": {
  ...existing fields...,
  "name": "Default Test Game",
  "description": "Minimal game for development testing"
}
```

## Files to Touch

- `data/games/fire-in-the-lake/` — whichever `.md` file contains the metadata YAML block
- `data/games/texas-holdem/` — whichever `.md` file contains the metadata YAML block
- `packages/runner/src/bootstrap/fitl-game-def.json`
- `packages/runner/src/bootstrap/texas-game-def.json`
- `packages/runner/src/bootstrap/default-game-def.json`

## Out of Scope

- Engine type/schema changes (done in SESSMGMT-001)
- Bootstrap registry code changes (done in SESSMGMT-003)
- Any UI components

## Acceptance Criteria

### Tests That Must Pass

1. **Engine compile test**: Production FITL spec compiles and `GameDef.metadata.name === "Fire in the Lake"` and `GameDef.metadata.description` is set.
2. **Engine compile test**: Production Texas Hold'em spec compiles and `GameDef.metadata.name === "Texas Hold'em"` and `GameDef.metadata.description` is set.
3. **Runner bootstrap test**: All three bootstrap fixture JSONs parse through the engine's `GameDefSchema` without validation errors.
4. **Existing engine tests**: `pnpm -F @ludoforge/engine test` passes.
5. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Both production game specs include `name` and `description` in their metadata.
2. All three bootstrap fixture JSONs include `name` and `description` in their metadata objects.
3. No other fields in the metadata blocks are changed.
