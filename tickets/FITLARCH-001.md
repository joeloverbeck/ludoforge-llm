# FITLARCH-001: Isolate Internal Scenario-Deck Zones from Runner Visual Invariants

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`packages/runner/src/bootstrap/fitl-game-def.json` now includes additional hidden aux zones used by scenario deck materialization internals. Runner bootstrap invariants currently count all zones and fail (`58` expected vs `63` actual), creating a red runner suite despite valid engine behavior.

## Assumption Reassessment (2026-02-24)

1. `pnpm -F @ludoforge/runner test` currently fails in `resolve-bootstrap-config.test.ts` on zone count/category assertions.
2. The added zones are compiler/materialization internals (`__scenario_deck_*`) and are not board presentation targets.
3. Mismatch: tests assume all zones are board/visual categories; correction: visual invariants must explicitly scope to player-visible board zones (or non-internal zones).

## Architecture Check

1. Explicit internal-zone scoping is cleaner than brittle absolute counts because internal scaffolding can evolve independently.
2. This keeps game-specific data in GameSpecDoc/GameDef while preserving generic rendering rules by consuming only presentation-relevant zones.
3. No backwards-compatibility aliasing/shims; update tests and bootstrap handling to current contract only.

## What to Change

### 1. Define internal-zone handling contract for bootstrap validation

Update runner bootstrap invariant tests to exclude internal scenario-deck zones from visual category assertions and cardinality checks.

### 2. Keep visual-provider checks focused on category behavior

Retain assertions that `city/province/loc` categories map to expected generic shapes and adjacency expectations.

### 3. Guard against accidental UI leakage of internal zones

Add/extend a test that internal `__scenario_deck_*` zones do not become required visual-config obligations.

## Files to Touch

- `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify, if needed)
- `packages/runner/src/bootstrap/resolve-bootstrap-config.ts` (modify, only if test-driven contract requires filtering at source)

## Out of Scope

- Changing FITL game rules or deck behavior.
- Altering engine zone semantics.

## Acceptance Criteria

### Tests That Must Pass

1. `resolve-bootstrap-config` FITL invariant test passes with internal zones present.
2. Internal scenario-deck zones are not treated as required board-category visual targets.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Runner visual invariants are scoped to presentation-relevant zones, not compiler internals.
2. Generic rendering category rules (`city/province/loc`) remain intact.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` — scope zone count/category assertions to non-internal zones.
2. `packages/runner/test/config/visual-config-files.test.ts` — ensure FITL visual-config expectations remain valid with internal zones.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo test`
