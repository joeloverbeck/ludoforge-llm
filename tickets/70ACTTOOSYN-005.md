# 70ACTTOOSYN-005: Add FITL actionSummaries to verbalization YAML

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — data file only
**Deps**: 70ACTTOOSYN-002 (actionSummaries field must exist on VerbalizationDef for compilation to succeed)

## Problem

The FITL tooltip headers show raw AST content like `"Rally — Select up to 1 zone Category in expr(scalarArray)..."` instead of concise summaries. Authored `actionSummaries` must be added to the FITL verbalization YAML so the pipeline (tickets 003–004) can surface them.

## Assumption Reassessment (2026-03-20)

1. `data/games/fire-in-the-lake/05-verbalization.md` exists and contains a YAML block with `labels` — confirmed.
2. The spec provides a starting list of action IDs and summaries — these MUST be verified against the actual action definitions in `data/games/fire-in-the-lake/30-rules-actions.md` (and any other FITL rules files that define actions).
3. Action IDs in the YAML must match the exact `id` values used in the compiled GameDef actions — grep for action definitions to confirm.

## Architecture Check

1. This is a data-only change — no engine code is modified.
2. `actionSummaries` is a generic `Record<string, string>` in the verbalization YAML — no game-specific types in engine code.
3. Summaries are human-readable strings authored by the spec writer, not generated code.

## What to Change

### 1. Audit all FITL action IDs

Grep `data/games/fire-in-the-lake/` for all action definitions (look for `id:` fields under action blocks, or however actions are defined in the FITL spec YAML). Collect the complete set of action IDs.

### 2. Add actionSummaries section to 05-verbalization.md

**File**: `data/games/fire-in-the-lake/05-verbalization.md`

Add an `actionSummaries` key to the existing YAML block. Each key is an action ID, each value is a concise summary (1 line, imperative mood). The spec provides a starting list — verify every entry against the actual action definitions and add any missing actions.

Grouping suggestion (from spec):
- Coup round actions (coupVictory, coupResources, coupSupport, coupRedeploy, etc.)
- Event actions (pivotalEvent, etc.)
- Resource transfer actions
- Commitment & pacification actions
- Lifecycle triggers (on-coup-support-enter, etc.)

### 3. Verify compilation

After adding the YAML, run the FITL compilation pipeline to confirm the new section parses and compiles without errors.

## Files to Touch

- `data/games/fire-in-the-lake/05-verbalization.md` (modify)

## Out of Scope

- Texas Hold'em actionSummaries (70ACTTOOSYN-006)
- Engine code changes (tickets 001–004)
- Adding summaries to event cards or triggers
- Changing existing labels, stages, or macros in the FITL verbalization
- Modifying any FITL rules files (30-rules-actions.md, etc.)
- Visual styling of tooltips

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:e2e` — FITL compilation succeeds with the new `actionSummaries` section.
2. Every key in `actionSummaries` matches an actual action ID in the compiled FITL GameDef (no orphan keys).
3. Every action ID in the FITL GameDef that represents a player-facing action has a corresponding entry in `actionSummaries` (no missing summaries for visible actions — lifecycle/internal actions may be excluded with justification).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No existing YAML keys in `05-verbalization.md` are modified or removed.
2. The FITL game compiles and runs identically to before (actionSummaries is consumed only by the tooltip pipeline, which is a read-only overlay).
3. All existing FITL tests pass unchanged.

## Test Plan

### New/Modified Tests

1. No new test files — existing E2E compilation tests validate YAML parse/compile.
2. Optionally: extend FITL golden tooltip tests to assert summary presence once tickets 003–004 are also merged.

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm turbo test && pnpm turbo typecheck`
