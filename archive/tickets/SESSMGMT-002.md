# SESSMGMT-002: Add Metadata to Game Data Assets and Bootstrap Fixtures (Spec 43 D0 cont.)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only changes in YAML and JSON fixtures
**Deps**: SESSMGMT-001

## Reassessed Assumptions (2026-02-20)

1. SESSMGMT-001 is already landed in code and tests (`GameSpecMetadata`, `GameDef.metadata`, compiler pass-through, schemas, and metadata validation tests).
2. Canonical production metadata values differ from this ticket's original examples:
   - FITL player range is `2..4` (not `1..4`).
   - Texas metadata id is `texas-holdem-nlhe-tournament` (not `texas-holdem`).
3. Bootstrap registry is already data-driven via `import.meta.glob`; this ticket must remain data-only and avoid registry code changes.
4. Existing tests validate bootstrap fixture shape, but this ticket still needs explicit metadata-presence assertions for production compile and bootstrap fixture parsing.

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
    min: 2
    max: 4
```

### 2. `data/games/texas-holdem/*.md` — metadata YAML block

Same pattern:

```yaml
metadata:
  id: texas-holdem-nlhe-tournament
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
  "id": "texas-holdem-nlhe-tournament",
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
  "name": "Runner Bootstrap Default",
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

## Architectural Assessment

Adding display metadata to canonical game specs and bootstrap fixtures is beneficial versus the prior state because it removes UI-facing naming from implicit conventions and makes display metadata explicit, typed, and validated at compile/bootstrap boundaries. This keeps the architecture extensible for session-management screens without introducing game-specific engine branching.

Known tradeoff: fixture metadata duplicates canonical production metadata. That duplication is acceptable for now because bootstrap fixtures are explicit test/runtime artifacts, but longer-term cleanup could generate fixture metadata from canonical compile outputs to reduce drift risk.

## Acceptance Criteria

### Tests That Must Pass

1. **Engine compile test**: Production FITL spec compiles and `GameDef.metadata.name === "Fire in the Lake"` and `GameDef.metadata.description` is set.
2. **Engine compile test**: Production Texas Hold'em spec compiles and `GameDef.metadata.name === "Texas Hold'em"` and `GameDef.metadata.description` is set.
3. **Runner bootstrap test**: All three bootstrap fixture JSONs parse through the engine's `GameDefSchema` without validation errors, and each fixture metadata contains non-empty `name` and `description`.
4. **Existing engine tests**: `pnpm -F @ludoforge/engine test` passes.
5. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Both production game specs include `name` and `description` in their metadata.
2. All three bootstrap fixture JSONs include `name` and `description` in their metadata objects.
3. No other fields in the metadata blocks are changed.

## Outcome

- **Completion date**: 2026-02-20
- **What was changed**:
  - Added metadata `name`/`description` to FITL and Texas production metadata docs.
  - Added metadata `name`/`description` to all three runner bootstrap fixture GameDefs.
  - Added explicit engine integration assertions for FITL/Texas compiled metadata display fields.
  - Added explicit runner bootstrap assertions for fixture metadata display fields.
  - Corrected stale ticket assumptions (`texas-holdem-nlhe-tournament` id, FITL `players.min=2`, existing SESSMGMT-001 implementation state).
  - Follow-up hardening: made `default` bootstrap fixture generated from canonical `GameSpecDoc` (`data/games/runner-bootstrap-default`) and enforced `generatedFromSpecPath` as required for all bootstrap targets.
- **Deviations from original plan**:
  - Ticket text was corrected before implementation to align with current codebase reality and canonical IDs/ranges.
  - Default fixture display name standardized to `Runner Bootstrap Default` for consistency with its canonical id/source label.
  - Removed optional/manual bootstrap fixture path model in favor of a single generated-fixtures architecture.
- **Verification results**:
  - `pnpm turbo build` passed.
  - Targeted tests passed:
    - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/production-spec-strict-binding-regression.test.js`
    - `pnpm -F @ludoforge/runner exec vitest run test/bootstrap/resolve-bootstrap-config.test.ts`
  - Full suites passed:
    - `pnpm -F @ludoforge/engine test`
    - `pnpm -F @ludoforge/runner test`
  - Lint passed:
    - `pnpm turbo lint`
