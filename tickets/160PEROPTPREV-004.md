# 160PEROPTPREV-004: `preview.option.*` ref family + dispatch

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `cnl/policy-bytecode/feature-table.ts`, `agents/policy-expr.ts`, `schemas/GameDef.schema.json`
**Deps**: `specs/160-per-option-preview-inner-microturns.md`

## Problem

Spec 160 introduces eight new ref kinds in a `preview.option.*` family that operators query from microturn-scope considerations to read per-option preview values:

- `preview.option.victory.currentMargin.self`
- `preview.option.victory.currentRank.self`
- `preview.option.delta.victory.currentMargin.self`
- `preview.option.var.global.<id>`
- `preview.option.var.player.self.<id>`
- `preview.option.metric.<id>`
- `preview.option.outcome`
- `preview.option.driveDepth`

This ticket lands the static infrastructure: ref registration, dispatch wiring, and schema enum updates. The refs resolve to defaults (or `unresolved`) until ticket 005 supplies the per-option preview driver context — refs are declarative, behavior is wired up by the driver.

## Assumption Reassessment (2026-05-06)

1. `preview.victory.currentMargin.self` exists as a ref today (registered via `policy-surface.ts:207`); the new `preview.option.*` family is its per-option analog (verified during reassess-spec).
2. `microturn.option.*` refs (Spec 158) are registered at `packages/engine/src/cnl/compile-agents.ts:2235-2244`. The new family slots into the same registration pattern.
3. Dispatch in `policy-expr.ts` routes ref resolution by ref kind; the eight new kinds add new arms.

## Architecture Check

1. **Engine-agnostic** (Foundation 1): all eight refs are generic ref strings — no game identifiers in engine code.
2. **Specs are data** (Foundation 7): refs are declarative. Authoring `preferOptionProjectedMargin` against `preview.option.delta.victory.currentMargin.self` is data, not code.
3. **No backwards-compatibility shim** (Foundation 14): refs are additive — existing profiles do not reference them, so adding them silently breaks nothing.

## What to Change

### 1. Register eight new ref kinds in `feature-table.ts`

In `packages/engine/src/cnl/policy-bytecode/feature-table.ts`, register the eight ref kinds. Each ref kind:

- Has a string identifier (e.g., `preview.option.victory.currentMargin.self`).
- Has a scope tag indicating per-option preview (resolution requires the inner-preview driver context supplied by ticket 005).
- The `preview.option.delta.*` variant is per-option-specific — it reads the difference between post-option state and pre-option state. The other refs read the post-option state.

### 2. Add dispatch in `policy-expr.ts`

In `packages/engine/src/agents/policy-expr.ts`, add ref-resolution arms for the new kinds. Resolution rules:

- **Driver context unavailable** (the per-option preview drive has not been entered, e.g., during action-selection-only evaluation): the dispatch returns the default outcome — typically `unresolved` or `unknownNoPreviewDecision` — matching existing surface-ref convention.
- **Driver context available** (per-option preview drive has populated a resolved-refs map): the dispatch reads the value from the map.

### 3. Schema enum extension

In `packages/engine/schemas/GameDef.schema.json`, extend the ref-kind enum (the closed set used to validate `feature` strings on considerations) to include the eight new kinds.

## Files to Touch

- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify — register eight new ref kinds)
- `packages/engine/src/agents/policy-expr.ts` (modify — dispatch arms for the new kinds)
- `packages/engine/schemas/GameDef.schema.json` (modify — ref enum)

## Out of Scope

- Per-option preview driver — ticket 005 supplies the driver context that wires resolved refs.
- `delta.*` subtraction semantics — implemented in ticket 005 alongside the driver.
- Tests for ref resolution — those land in tickets 005 and 006 alongside the driver behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Existing `pnpm -F @ludoforge/engine test:unit` continues to pass — new ref kinds registered, default-resolution paths unchanged.
2. `pnpm turbo schema:artifacts` regenerates artifacts cleanly with the extended enum.
3. `pnpm turbo typecheck` — new ref kinds typecheck.

### Invariants

1. (architectural-invariant) Each of the eight ref kinds is registered in exactly one location (the feature-table registration).
2. (architectural-invariant) The dispatch in `policy-expr.ts` has exactly one arm per new ref kind.

## Test Plan

### New/Modified Tests

- None new in this ticket. Tests for ref resolution attach to ticket 005 (chooseOne driver).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo typecheck`
4. `pnpm -F @ludoforge/engine test`
