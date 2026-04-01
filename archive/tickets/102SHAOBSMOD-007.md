# 102SHAOBSMOD-007: Migrate FITL game spec to `observability:` section

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — game data only
**Deps**: `archive/tickets/102SHAOBSMOD-006.md`, `specs/102-shared-observer-model.md`

## Problem

FITL's `92-agents.md` currently defines visibility inline under `agents.visibility`. With the `agents.visibility` field removed (ticket 006), the FITL game spec must migrate to the new `observability:` section. Texas Hold'em has no `agents.visibility` section and requires no migration.

## Assumption Reassessment (2026-04-01)

1. `data/games/fire-in-the-lake/92-agents.md` exists — confirmed.
2. `data/games/texas-holdem/92-agents.md` exists — confirmed.
3. FITL `92-agents.md` contains an `agents.visibility` section — must be verified at implementation time by reading the file.
4. Texas Hold'em `92-agents.md` has no `agents.visibility` section — must be verified at implementation time.

## Architecture Check

1. Migrates game data only — no engine code changes.
2. The FITL observer profile uses defaults + overrides so only deviations from system defaults are declared — minimal YAML surface.
3. Per FOUNDATIONS.md #14, no compatibility shim — `agents.visibility` is removed, `observability:` is added.

## What to Change

### 1. Create FITL observability section

Either add an `observability:` section to `data/games/fire-in-the-lake/92-agents.md` or create a new `data/games/fire-in-the-lake/92-observability.md` file (follow whichever pattern the codebase uses for section files).

Define a `currentPlayer` observer that mirrors the current FITL `agents.visibility` content using defaults + overrides:

```yaml
observability:
  observers:
    currentPlayer:
      description: "Standard FITL player perspective"
      surfaces:
        # Only override surfaces that differ from system defaults
        # System defaults: globalVars=public, perPlayerVars=seatVisible,
        # derivedMetrics=hidden, victory.*=hidden, activeCard*=hidden
        # Declare only the overrides needed for FITL
```

The exact surface overrides depend on what FITL's current `agents.visibility` declares — read the file at implementation time.

### 2. Update FITL agent profiles

Add `observer: currentPlayer` to each FITL agent profile that currently uses the visibility section.

### 3. Remove `agents.visibility` from FITL `92-agents.md`

Remove the `visibility:` key from under `agents:`.

### 4. Verify Texas Hold'em compiles unchanged

Texas Hold'em profiles have no `observer` field → they use the built-in `default` observer. Compile and verify no errors.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- Possibly `data/games/fire-in-the-lake/92-observability.md` (new — if section split is preferred)

## Out of Scope

- Fixing Texas Hold'em's omniscient visibility — that is a game design task, not a framework task
- Runner-side enforcement of observer projections — follow-up spec
- Zone/token visibility in observer profiles — Spec 106

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles successfully with the migrated observability section
2. FITL compiled `AgentPolicyCatalog.surfaceVisibility` matches pre-migration output (behavioral equivalence)
3. Texas Hold'em compiles successfully with no changes
4. No grep hits for `visibility:` directly under `agents:` in FITL game spec files

### Invariants

1. FITL observer profile produces identical `CompiledSurfaceCatalog` as the previous `agents.visibility` — no behavioral change
2. Texas Hold'em is untouched — profiles use built-in `default` observer

## Test Plan

### New/Modified Tests

1. No new test files — existing FITL compilation tests and cross-game tests verify behavioral equivalence

### Commands

1. `pnpm -F @ludoforge/engine test:e2e` — end-to-end compilation tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo build` — build succeeds

## Outcome

**Completion date**: 2026-04-01

**What changed**:
- All deliverables were completed as part of ticket 006 (102SHAOBSMOD-006), not as a separate change.
- `data/games/fire-in-the-lake/93-observability.md` created with `currentPlayer` observer containing all FITL visibility overrides
- `data/games/fire-in-the-lake/92-agents.md` had `agents.visibility` removed, `observer: currentPlayer` added to all 5 profiles
- `data/games/fire-in-the-lake.game-spec.md` updated with `93-observability.md` import
- Texas Hold'em compiles unchanged (no `observer` field, uses built-in `default`)

**Deviations from plan**:
- This ticket's scope was pulled entirely into ticket 006 per FOUNDATIONS.md #14 ("migrate all owned artifacts in the same change"). Removing the `agents.visibility` TypeScript type in ticket 006 required migrating FITL's YAML in the same change to avoid breaking tests. No additional implementation was needed for this ticket.

**Verification**:
- All acceptance criteria verified: FITL compiles, no `visibility:` under `agents:`, Texas Hold'em unchanged
- `pnpm -F @ludoforge/engine test`: 5432 pass, 0 fail (verified during ticket 006)
