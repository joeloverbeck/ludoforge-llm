# ENGINEARCH-022: Fail Fast on Unknown Map-Space IDs in Marker-State Resolution

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — selector/map-space validation path + resolve-ref marker-state error semantics + unit tests
**Deps**: None

## Problem

`markerState` currently accepts any bound/literal map-space string, brands it as `ZoneId`, and falls back to marker lattice defaults when no marker state exists. This permits invalid map-space IDs to silently pass through instead of producing typed evaluation errors.

## Assumption Reassessment (2026-02-25)

1. `resolveMapSpaceId` in `packages/engine/src/kernel/resolve-selectors.ts` currently normalizes strings to branded `ZoneId` but does not validate that IDs exist in `def.zones` or runtime zone state.
2. `resolveRef` marker-state path in `packages/engine/src/kernel/resolve-ref.ts` currently reads `ctx.state.markers[spaceId] ?? {}` and can therefore return lattice defaults for unknown spaces.
3. No active ticket in `tickets/` currently addresses unknown map-space validation behavior for marker-state resolution.

## Architecture Check

1. Separating normalization from existence validation is cleaner and more robust than treating branding as existence proof.
2. Validation remains generic map-space contract enforcement; it does not introduce game-specific logic into `GameDef`, kernel, or simulator.
3. No backwards-compatibility shims or alias paths: invalid map-space IDs should fail immediately with typed errors.

## What to Change

### 1. Introduce explicit existing-map-space validation at marker-state resolution boundary

Ensure marker-state lookup rejects unknown map-space IDs before reading marker state or falling back to lattice defaults.

### 2. Emit deterministic typed error context for unknown map spaces

Return an existing eval error code (preferably `MISSING_VAR`) with context that includes attempted map-space ID and available map-space IDs.

### 3. Preserve existing valid-space behavior

Keep current behavior for valid spaces unchanged:
- explicit marker state still wins
- lattice default still applies when marker exists but space has no explicit value

## Files to Touch

- `packages/engine/src/kernel/resolve-ref.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify, if helper extraction is needed)
- `packages/engine/test/unit/resolve-ref.test.ts` (modify)

## Out of Scope

- Visual-config or runner presentation behavior
- Game-specific marker semantics
- Marker lattice schema redesign

## Acceptance Criteria

### Tests That Must Pass

1. `markerState` with unknown map-space binding fails fast with typed eval error and no lattice-default fallback.
2. `markerState` with known map-space and absent explicit marker still returns lattice default.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Branded IDs are not treated as proof of existence without explicit validation.
2. GameDef/kernel/simulator remain fully game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/resolve-ref.test.ts` — add negative `markerState` case for unknown map-space binding to prevent silent default fallback.
2. `packages/engine/test/unit/resolve-ref.test.ts` — retain/strengthen default-on-known-space coverage to prove no regression.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/resolve-ref.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

