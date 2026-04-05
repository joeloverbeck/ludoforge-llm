# 112GLBMRKPOLSUR-001: Types and schemas for globalMarker surface family

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types, Zod schemas
**Deps**: `specs/112-global-marker-policy-surface.md`

## Problem

The `SurfaceRefFamily` union and `CompiledSurfaceCatalog` interface have no `globalMarker` variant. Before any parsing, resolution, or compilation logic can be added, the type foundation must exist.

## Assumption Reassessment (2026-04-05)

1. `SurfaceRefFamily` is at `types-core.ts:338-347` with 9 existing variants — confirmed.
2. `CompiledSurfaceCatalog` is at `types-core.ts:548-560` with 8 fields — confirmed.
3. `CompiledSurfaceRefBaseSchema` is at `schemas-core.ts:637-656` with 5 family literals — confirmed.
4. `CompiledSurfaceCatalogSchema` is at `schemas-core.ts:292-306` with 8 fields — confirmed.

## Architecture Check

1. Pure additive type change — no logic modification. All new fields/variants extend existing unions/interfaces.
2. Engine-agnostic: `globalMarker` is a generic surface family name, not game-specific.
3. No backwards-compatibility shims — new optional catalog field, new union variant.

## What to Change

### 1. Add `'globalMarker'` to `SurfaceRefFamily` union (`types-core.ts:338-347`)

```typescript
export type SurfaceRefFamily =
  | 'globalVar'
  | 'perPlayerVar'
  | 'derivedMetric'
  | 'victoryCurrentMargin'
  | 'victoryCurrentRank'
  | 'activeCardIdentity'
  | 'activeCardTag'
  | 'activeCardMetadata'
  | 'activeCardAnnotation'
  | 'globalMarker';
```

### 2. Add `globalMarkers` to `CompiledSurfaceCatalog` (`types-core.ts:548-560`)

```typescript
readonly globalMarkers: Readonly<Record<string, CompiledSurfaceVisibility>>;
```

Pattern follows `globalVars`.

### 3. Add `z.literal('globalMarker')` to `CompiledSurfaceRefBaseSchema` (`schemas-core.ts:637-656`)

Add to the `family` union in the schema.

### 4. Add `globalMarkers` to `CompiledSurfaceCatalogSchema` (`schemas-core.ts:292-306`)

```typescript
globalMarkers: z.record(StringSchema, CompiledSurfaceVisibilitySchema),
```

### 5. Regenerate schema artifacts

Run `pnpm -F @ludoforge/engine run schema:artifacts`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/` (regenerate)

## Out of Scope

- No parsing, resolution, or compilation logic
- No changes to policy-surface.ts, policy-runtime.ts, or compile-*.ts
- No tests beyond schema artifact verification

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine run schema:artifacts:check` passes
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All new fields/variants are additive — no existing consumer breaks
2. Zod schemas match TypeScript interfaces exactly

## Test Plan

### New/Modified Tests

1. No new test files — pure type/schema change verified by existing schema artifact checks and compilation.

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts`
2. `pnpm -F @ludoforge/engine run schema:artifacts:check`
3. `pnpm -F @ludoforge/engine test`

## Outcome

Completed: 2026-04-05

What changed:
- Added `'globalMarker'` to `SurfaceRefFamily` in `packages/engine/src/kernel/types-core.ts`.
- Added `globalMarkers` to `CompiledSurfaceCatalog` in `packages/engine/src/kernel/types-core.ts`.
- Added the matching `globalMarker` family literal and `globalMarkers` catalog field to `packages/engine/src/kernel/schemas-core.ts`.

Deviations from original plan:
- `pnpm -F @ludoforge/engine run schema:artifacts` was still required and passed, but it left no persisted diff under `packages/engine/schemas/`; the generator-backed schema surface remained in sync with the source changes without a material artifact update.
- The referenced dependency spec `specs/112-global-marker-policy-surface.md` already had unrelated local edits; it was treated as read-only context and left untouched by this ticket.

Verification results:
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `pnpm -F @ludoforge/engine run schema:artifacts:check`
- `pnpm -F @ludoforge/engine test` (`467/467` passing)
