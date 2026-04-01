# 106ZONTOKOBS-002: Add zone entry types to `game-spec-doc.ts`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `game-spec-doc.ts`
**Deps**: `archive/tickets/106ZONTOKOBS-001.md`, `specs/106-zone-token-observer-integration.md`

## Problem

The GameSpecDoc observer profile type must include an optional `zones` field for YAML-authored zone visibility overrides. The YAML types (`GameSpecObserverZoneEntryDef`, `GameSpecObserverZonesDef`) must exist before validation or compilation code can reference them.

## Assumption Reassessment (2026-04-01)

1. `GameSpecObserverProfileDef` exists in `packages/engine/src/cnl/game-spec-doc.ts` — confirmed. Has `extends`, `description`, `surfaces` fields. No `zones` field.
2. `GameSpecObserverSurfacesDef` exists — confirmed. The zone types follow the same pattern.
3. No `GameSpecObserverZoneEntryDef` or `GameSpecObserverZonesDef` types exist yet — confirmed.

## Architecture Check

1. Zone entry types are placed in `game-spec-doc.ts` alongside existing observer surface types — consistent placement.
2. `zones` is optional on `GameSpecObserverProfileDef` — specs without zone overrides omit the field.
3. Zone keys use base zone IDs (matching `GameSpecZoneDef.id`), not qualified IDs.

## What to Change

### 1. Add zone entry types to `packages/engine/src/cnl/game-spec-doc.ts`

Add after the observer surface types:

```typescript
export interface GameSpecObserverZoneEntryDef {
  readonly tokens?: string;  // 'public' | 'owner' | 'hidden'
  readonly order?: string;   // 'public' | 'owner' | 'hidden'
}

export type GameSpecObserverZonesDef = Readonly<Record<string, GameSpecObserverZoneEntryDef>>;
```

### 2. Update `GameSpecObserverProfileDef`

Add `zones` field:

```typescript
export interface GameSpecObserverProfileDef {
  readonly extends?: string;
  readonly description?: string;
  readonly surfaces?: GameSpecObserverSurfacesDef;
  readonly zones?: GameSpecObserverZonesDef;  // NEW
}
```

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)

## Out of Scope

- Validation logic (`validate-observers.ts`) — that is ticket 003
- Compilation logic (`compile-observers.ts`) — that is ticket 004
- Runtime changes — ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes
2. `pnpm -F @ludoforge/engine test` — existing tests pass unchanged

### Invariants

1. `zones` is optional — existing specs without zone overrides continue to work
2. No behavioral change — types only

## Test Plan

### New/Modified Tests

1. No new test files — type-only change verified by typecheck

### Commands

1. `pnpm turbo typecheck` — type correctness
2. `pnpm -F @ludoforge/engine test` — full engine test suite
