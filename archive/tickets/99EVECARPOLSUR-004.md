# 99EVECARPOLSUR-004: Extend surface visibility catalog and compilation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — types-core.ts (catalog type), compile-agents.ts (visibility lowering)
**Deps**: 99EVECARPOLSUR-003

## Problem

The `CompiledAgentPolicySurfaceCatalog` has no entries for active-card visibility. Game authors need to control whether card identity, tags, and metadata are visible to agents. The catalog type must be extended and the compiler must parse the new visibility entries from authored YAML.

## Assumption Reassessment (2026-03-31)

1. `CompiledAgentPolicySurfaceCatalog` at `types-core.ts:486-494` has four categories: `globalVars`, `perPlayerVars`, `derivedMetrics`, `victory` — confirmed.
2. `lowerSurfaceVisibility` at `compile-agents.ts:117` assembles the catalog from authored YAML. It calls `lowerSurfaceVisibilityMap` for maps and `lowerSurfaceVisibilityEntry` for single entries — confirmed.
3. The `victory` category uses flat `CompiledAgentPolicySurfaceVisibility` entries (not maps) — same pattern needed for the three new card categories.
4. Default visibility when omitted should be `hidden` (opt-in visibility, matching established principle).

## Architecture Check

1. Three flat visibility entries (not maps) is correct — there's one active card at a time, not a per-card visibility map. This matches the `victory.currentMargin`/`victory.currentRank` pattern.
2. Independent visibility per category allows fine-grained control (e.g., expose card identity but hide metadata).
3. Uses existing `lowerSurfaceVisibilityEntry` — no new compilation infrastructure needed.

## What to Change

### 1. Extend `CompiledAgentPolicySurfaceCatalog` in `types-core.ts`

Add three new flat visibility entries:

```typescript
export interface CompiledAgentPolicySurfaceCatalog {
  // Existing:
  readonly globalVars: Readonly<Record<string, CompiledAgentPolicySurfaceVisibility>>;
  readonly perPlayerVars: Readonly<Record<string, CompiledAgentPolicySurfaceVisibility>>;
  readonly derivedMetrics: Readonly<Record<string, CompiledAgentPolicySurfaceVisibility>>;
  readonly victory: {
    readonly currentMargin: CompiledAgentPolicySurfaceVisibility;
    readonly currentRank: CompiledAgentPolicySurfaceVisibility;
  };
  // NEW:
  readonly activeCardIdentity: CompiledAgentPolicySurfaceVisibility;
  readonly activeCardTag: CompiledAgentPolicySurfaceVisibility;
  readonly activeCardMetadata: CompiledAgentPolicySurfaceVisibility;
}
```

### 2. Extend `lowerSurfaceVisibility` in `compile-agents.ts`

After the existing `victory` lowering, add lowering for the three new entries:

```typescript
activeCardIdentity: lowerSurfaceVisibilityEntry(
  authored?.activeCardIdentity, diagnostics, 'visibility.activeCardIdentity', hiddenDefault
),
activeCardTag: lowerSurfaceVisibilityEntry(
  authored?.activeCardTag, diagnostics, 'visibility.activeCardTag', hiddenDefault
),
activeCardMetadata: lowerSurfaceVisibilityEntry(
  authored?.activeCardMetadata, diagnostics, 'visibility.activeCardMetadata', hiddenDefault
),
```

Verify `hiddenDefault` is the correct default constant for entries omitted from authored YAML. Grep for how `victory` entries default when omitted.

### 3. Update `getPolicySurfaceVisibility` in `policy-surface.ts`

Ensure the three new families map to their catalog entries. This may already be partially handled in ticket 003 — coordinate to avoid duplication.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — extend `CompiledAgentPolicySurfaceCatalog`)
- `packages/engine/src/cnl/compile-agents.ts` (modify — extend `lowerSurfaceVisibility`)
- `packages/engine/src/agents/policy-surface.ts` (modify — extend `getPolicySurfaceVisibility` if not already done in 003)

## Out of Scope

- Runtime resolution of card surfaces (ticket 005)
- FITL agent profile YAML changes (ticket 006)
- Per-card or per-tag granular visibility (all tags share one visibility setting, all metadata keys share one)

## Acceptance Criteria

### Tests That Must Pass

1. Compiling an agent profile with `activeCardIdentity: { current: public }` produces a catalog with `activeCardIdentity.current === 'public'`.
2. Omitting all three card visibility entries defaults to `hidden` for each.
3. Each of the three categories can be set independently (identity public, tags hidden, metadata hidden).
4. Existing visibility entries (`globalVars`, `perPlayerVars`, `derivedMetrics`, `victory`) compile unchanged.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Default visibility for omitted card categories is `hidden` — not `public`.
2. The three card categories are flat entries, not maps — one visibility setting per category.
3. No backwards-compatibility shims for existing catalogs without card entries.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents.test.ts` — add tests for card visibility lowering: explicit values, defaults, mixed configurations.
2. `packages/engine/test/unit/agents/policy-surface.test.ts` — add tests for `getPolicySurfaceVisibility` with new families (if not covered in 003).

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "visibility"` (targeted)
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - `packages/engine/src/cnl/game-spec-doc.ts` — Extended `GameSpecAgentVisibilitySection` with `activeCardIdentity?`, `activeCardTag?`, `activeCardMetadata?` fields
  - `packages/engine/src/cnl/compile-agents.ts` — Replaced hardcoded hidden defaults with `lowerSurfaceVisibilityEntry()` calls that parse authored YAML
  - `packages/engine/test/unit/compile-agents-authoring.test.ts` — Updated `createVisibility` helper; added 3 tests (explicit values, defaults, independent categories)
- **Deviations**: Type extension of `CompiledAgentPolicySurfaceCatalog` and `getPolicySurfaceVisibility` case arms were already implemented in ticket 003. This ticket's contribution was the authored YAML type and compiler wiring.
- **Verification**: 712 engine tests pass, 0 failures. All 3 new tests pass.
