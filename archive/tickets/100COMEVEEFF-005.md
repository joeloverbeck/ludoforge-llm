# 100COMEVEEFF-005: Add activeCardAnnotation surface ref parsing and visibility

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — agents (policy-surface.ts), compiler (compile-agents.ts)
**Deps**: `archive/tickets/100COMEVEEFF-001.md`

## Problem

Policies need to reference annotation data via `activeCard.annotation.SIDE.METRIC` surface refs. The parsing and visibility infrastructure must understand the new `activeCardAnnotation` family so that authored YAML refs compile to the correct `CompiledAgentPolicySurfaceRef` and visibility rules gate access appropriately.

## Assumption Reassessment (2026-03-31)

1. `parseAuthoredPolicySurfaceRef` at `packages/engine/src/agents/policy-surface.ts:25` handles `activeCard.*` paths for identity/tag/metadata families. The annotation family adds a new branch in the same `activeCard.` prefix.
2. `getPolicySurfaceVisibility` at `policy-surface.ts:180` resolves visibility for each family. Needs a new case for `activeCardAnnotation`.
3. `lowerSurfaceVisibility` at `compile-agents.ts:117` compiles authored YAML visibility into the catalog. Currently handles `activeCardIdentity`, `activeCardTag`, `activeCardMetadata` (lines 173-185). Needs `activeCardAnnotation`.
4. The `CompiledAgentPolicySurfaceCatalog` type (from ticket 001) must already include `activeCardAnnotation` before this ticket starts.

## Architecture Check

1. Follows the exact same pattern as the three Spec 99 families (`activeCardIdentity`, `activeCardTag`, `activeCardMetadata`). No new parsing infrastructure — just a new branch.
2. Surface ref paths use dot-separated segments: `activeCard.annotation.{unshaded|shaded}.{metric}[.{seatId|self}]`. This is slightly deeper than existing refs but uses the same parsing approach.
3. No game-specific logic. The parser doesn't know what `unshaded` or `tokenPlacements` mean — it just extracts path segments into a structured ref.

## What to Change

### 1. Extend `parseAuthoredPolicySurfaceRef` in `policy-surface.ts`

Add parsing for `activeCard.annotation.*` paths. The ref path structure:

```
activeCard.annotation.{side}.{metric}
activeCard.annotation.{side}.{metric}.{seat}
```

Where:
- `side`: `unshaded` or `shaded`
- `metric`: one of the `CompiledEventSideAnnotation` field names
- `seat`: optional literal seat ID or `self` (only for per-seat metrics like `tokenPlacements`)

The parsed result should produce a `CompiledAgentPolicySurfaceRef` with:
- `family: 'activeCardAnnotation'`
- `id`: encoded path (e.g., `unshaded.tokenPlacements.us`)

### 2. Extend `getPolicySurfaceVisibility` in `policy-surface.ts`

Add case for `activeCardAnnotation` family — look up visibility from `catalog.activeCardAnnotation`.

### 3. Extend `lowerSurfaceVisibility` in `compile-agents.ts`

Add parsing of `activeCardAnnotation` visibility from authored YAML, following the same pattern as `activeCardMetadata` (line 185). The authored YAML shape:

```yaml
activeCardAnnotation:
  current: public
  preview:
    visibility: public
    allowWhenHiddenSampling: false
```

### 4. Extend `resolveSurfaceRuntimeRef` for annotation path validation

In `compile-agents.ts`, the `resolveSurfaceRuntimeRef` method validates ref paths at compile time. Add recognition of `activeCard.annotation.*` paths so they don't produce "unknown surface ref" diagnostics.

### 5. Unit tests

Test parsing of all annotation ref path variants:
- `activeCard.annotation.unshaded.tokenPlacements.us` → correct family/id
- `activeCard.annotation.shaded.markerModifications` → no seat segment
- `activeCard.annotation.unshaded.tokenPlacements.self` → self-seat
- `activeCard.annotation.unshaded.grantsOperation` → boolean metric
- Invalid paths (missing side, unknown metric) → parse failure

Test visibility:
- `activeCardAnnotation` visibility lookup returns correct config
- Default visibility when not specified

## Files to Touch

- `packages/engine/src/agents/policy-surface.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/unit/agents/policy-surface-annotation.test.ts` (new)

## Out of Scope

- Runtime resolution of annotation values (ticket 006)
- FITL agent profile YAML changes (ticket 007)
- Golden tests (ticket 008)
- The annotation builder itself (ticket 003)

## Acceptance Criteria

### Tests That Must Pass

1. `parseAuthoredPolicySurfaceRef` correctly parses all annotation ref path variants
2. Invalid annotation paths (missing side, bad metric name) produce parse errors
3. `getPolicySurfaceVisibility` returns correct visibility for `activeCardAnnotation` family
4. `lowerSurfaceVisibility` compiles authored `activeCardAnnotation` visibility YAML
5. `resolveSurfaceRuntimeRef` accepts annotation paths without diagnostics
6. Existing surface ref tests continue passing
7. Existing suite: `pnpm turbo test`

### Invariants

1. Annotation refs follow the same `CompiledAgentPolicySurfaceRef` contract as all other families
2. No game-specific logic in parsing — path segments are treated as opaque strings
3. Visibility defaults follow the same pattern as other `activeCard.*` families

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-surface-annotation.test.ts` — parsing and visibility tests for all annotation ref path variants

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-surface-annotation.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - `packages/engine/src/agents/policy-surface.ts` — added `activeCard.annotation.*` branch to `parseAuthoredPolicySurfaceRef`, parsing `activeCard.annotation.{side}.{metric}` and `activeCard.annotation.{side}.{metric}.{seat}` paths into `CompiledAgentPolicySurfaceRef` with family `activeCardAnnotation`
  - `packages/engine/test/unit/agents/policy-surface-annotation.test.ts` (new) — 15 tests covering seat-scoped refs, no-seat refs, preview scope, invalid paths, and visibility lookup
- **Deviations from plan**:
  - Items 2 (`getPolicySurfaceVisibility`), 3 (`lowerSurfaceVisibility`), and 4 (`resolveSurfaceRuntimeRef`) were already implemented in prior tickets (001-004). No additional changes were needed for those — only the parsing branch (item 1) and tests (item 5) were new work.
- **Verification**: build ✅, typecheck ✅, 15/15 new tests pass, 5268/5268 full suite pass
