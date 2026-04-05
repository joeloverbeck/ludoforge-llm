# 113PREVSTPOLSUR-002: Compile `preview.feature.*` refs in compile-agents

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL agent compiler
**Deps**: `tickets/113PREVSTPOLSUR-001.md`, `specs/113-preview-state-policy-surface.md`

## Problem

`resolvePreviewRuntimeRef()` in `compile-agents.ts` handles `preview.` refs by delegating to `resolveSurfaceRuntimeRef()`. This only works for surface families (victory, vars, metrics, cards, globalMarkers). A `preview.feature.vcGuerrillaCount` ref currently fails with "unknown library ref" because the `feature.` prefix is not recognized in the preview path.

## Assumption Reassessment (2026-04-05)

1. `resolvePreviewRuntimeRef()` at `compile-agents.ts:1837-1858` — confirmed, strips `preview.` prefix and delegates to surface resolution.
2. State features are compiled and stored in the agent policy catalog — confirmed, accessible via feature ID.
3. `feature.<id>` refs compile as `{ kind: 'library', refKind: 'stateFeature', id }` — confirmed at `compile-agents.ts:1586-1641`.

## Architecture Check

1. Follows the existing `preview.` prefix stripping pattern. The new path is `preview.feature.<id>` → strip `preview.` → detect `feature.` → look up in library → compile as `previewStateFeature`.
2. Reuses the existing state feature library validation — if the feature ID doesn't exist in the library, compilation emits a diagnostic. No duplication.
3. Engine-agnostic: compiles any authored state feature for preview evaluation, not game-specific features.

## What to Change

### 1. Extend `resolvePreviewRuntimeRef()` (`compile-agents.ts:1837-1858`)

Before the existing `resolveSurfaceRuntimeRef` delegation, add a check for `preview.feature.`:

```typescript
// Inside resolvePreviewRuntimeRef, after stripping 'preview.' prefix:
const nestedPath = refPath.slice('preview.'.length);

if (nestedPath.startsWith('feature.')) {
  const featureId = nestedPath.slice('feature.'.length);
  // Validate featureId exists in stateFeatures library
  const feature = catalog.stateFeatures[featureId];
  if (feature === undefined) {
    diagnostics.push(/* unknown preview feature diagnostic */);
    return undefined;
  }
  return {
    kind: 'library' as const,
    refKind: 'previewStateFeature' as const,
    id: featureId,
  };
}

// Existing surface ref delegation follows...
```

### 2. Unit tests

- `preview.feature.vcGuerrillaCount` compiles successfully when `vcGuerrillaCount` is a declared state feature
- `preview.feature.nonExistent` produces a compilation diagnostic
- Existing `preview.victory.*` and `preview.var.*` refs continue to work identically

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/cnl/compile-agents-preview-feature.test.ts` (new)

## Out of Scope

- No evaluation logic (ticket 003)
- No changes to `policy-evaluation-core.ts`, `policy-runtime.ts`, or `policy-preview.ts`
- No diagnostics threading (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. `preview.feature.<id>` compiles to `{ kind: 'library', refKind: 'previewStateFeature', id }` when feature exists
2. `preview.feature.<unknown>` produces a diagnostic error
3. Existing `preview.victory.*`, `preview.var.*`, `preview.globalMarker.*` refs compile unchanged
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No new library ref kind leaks into non-preview paths (`feature.<id>` still compiles as `stateFeature`)
2. The compiled ref carries the same feature ID — the expression to evaluate is looked up at evaluation time, not compilation time

## Test Plan

### New/Modified Tests

1. `packages/engine/test/cnl/compile-agents-preview-feature.test.ts` — compilation tests for preview.feature.* refs

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/cnl/compile-agents-preview-feature.test.js`
2. `pnpm -F @ludoforge/engine test`
