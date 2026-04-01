# 106ZONTOKOBS-001: Add zone visibility compiled types and Zod schemas

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `types-core.ts`, `schemas-core.ts`
**Deps**: `specs/106-zone-token-observer-integration.md`

## Problem

The compiled observer profile must include optional zone visibility data. The types (`ZoneObserverVisibilityClass`, `CompiledZoneVisibilityEntry`, `CompiledZoneVisibilityCatalog`) and corresponding Zod schemas need to exist before any compilation or validation code can reference them.

## Assumption Reassessment (2026-04-01)

1. `CompiledObserverProfile` exists in `packages/engine/src/kernel/types-core.ts` — confirmed. Has reserved comment `// RESERVED for Spec 106: // readonly zones?: CompiledZoneVisibilityCatalog;`.
2. `CompiledObserverProfileSchema` exists in `packages/engine/src/kernel/schemas-core.ts` — confirmed. Does not include `zones`.
3. No `ZoneObserverVisibilityClass`, `CompiledZoneVisibilityEntry`, or `CompiledZoneVisibilityCatalog` types exist yet — confirmed.

## Architecture Check

1. Types placed in `types-core.ts` alongside existing compiled types — consistent placement.
2. `zones` is optional on `CompiledObserverProfile` — specs without zone overrides produce `undefined`, preserving current behavior.
3. Game-agnostic: zone visibility types are generic, not game-specific.

## What to Change

### 1. Add zone visibility types to `packages/engine/src/kernel/types-core.ts`

```typescript
export type ZoneObserverVisibilityClass = 'public' | 'owner' | 'hidden';

export interface CompiledZoneVisibilityEntry {
  readonly tokens: ZoneObserverVisibilityClass;
  readonly order: ZoneObserverVisibilityClass;
}

export interface CompiledZoneVisibilityCatalog {
  readonly entries: Readonly<Record<string, CompiledZoneVisibilityEntry>>;
  readonly defaultEntry?: CompiledZoneVisibilityEntry;
}
```

### 2. Update `CompiledObserverProfile` in `types-core.ts`

Replace the reserved comment with the actual field:

```typescript
export interface CompiledObserverProfile {
  readonly fingerprint: string;
  readonly surfaces: CompiledSurfaceCatalog;
  readonly zones?: CompiledZoneVisibilityCatalog;  // NEW
}
```

### 3. Add Zod schemas to `packages/engine/src/kernel/schemas-core.ts`

```typescript
const ZoneObserverVisibilityClassSchema = z.union([
  z.literal('public'),
  z.literal('owner'),
  z.literal('hidden'),
]);

const CompiledZoneVisibilityEntrySchema = z.object({
  tokens: ZoneObserverVisibilityClassSchema,
  order: ZoneObserverVisibilityClassSchema,
}).strict();

const CompiledZoneVisibilityCatalogSchema = z.object({
  entries: z.record(StringSchema, CompiledZoneVisibilityEntrySchema),
  defaultEntry: CompiledZoneVisibilityEntrySchema.optional(),
}).strict();
```

Update `CompiledObserverProfileSchema` to include optional `zones`:

```typescript
export const CompiledObserverProfileSchema = z.object({
  fingerprint: StringSchema,
  surfaces: CompiledSurfaceCatalogSchema,
  zones: CompiledZoneVisibilityCatalogSchema.optional(),  // NEW
}).strict();
```

### 4. Regenerate `GameDef.schema.json`

Run `pnpm -F @ludoforge/engine run schema:artifacts`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)

## Out of Scope

- GameSpec YAML types (`game-spec-doc.ts`) — that is ticket 002
- Validation logic (`validate-observers.ts`) — that is ticket 003
- Compilation logic (`compile-observers.ts`) — that is ticket 004
- Runtime changes (`observation.ts`) — that is ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes
2. `pnpm -F @ludoforge/engine run schema:artifacts:check` passes (idempotent)
3. `pnpm -F @ludoforge/engine test` — existing tests pass unchanged
4. `GameDef.schema.json` includes `zones` in the observer profile schema

### Invariants

1. `zones` is optional on `CompiledObserverProfile` — no breaking change for existing consumers
2. Existing `compile-observers.ts` continues to work (it doesn't populate `zones` yet)

## Test Plan

### New/Modified Tests

1. No new test files — type-only change verified by typecheck and schema artifacts

### Commands

1. `pnpm turbo typecheck` — type correctness
2. `pnpm -F @ludoforge/engine run schema:artifacts` — regenerate schema
3. `pnpm -F @ludoforge/engine test` — full engine test suite
