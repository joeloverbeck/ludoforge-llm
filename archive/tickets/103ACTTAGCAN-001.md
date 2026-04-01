# 103ACTTAGCAN-001: Add `tags` field to `GameSpecActionDef` and `ActionDef`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `game-spec-doc.ts`, `types-core.ts`
**Deps**: `specs/103-action-tags-and-candidate-metadata.md`

## Problem

Action definitions need an optional `tags` field so that game authors can label actions with semantic categories (e.g., `insurgent-operation`, `placement`). The spec and compiled types must accept this field before any compilation or ref resolution code can use it.

## Assumption Reassessment (2026-04-01)

1. `GameSpecActionDef` in `packages/engine/src/cnl/game-spec-doc.ts:176-187` — confirmed. No `tags` field.
2. `ActionDef` in `packages/engine/src/kernel/types-core.ts:182-193` — confirmed. No `tags` field.
3. No existing `tags` field on any action type — confirmed.

## Architecture Check

1. `tags` is optional on both types — existing actions without tags continue to work identically.
2. Tags are `readonly string[]` — generic, game-agnostic (Foundation 1).
3. No behavioral change — type-only addition.

## What to Change

### 1. Add `tags` to `GameSpecActionDef` in `game-spec-doc.ts`

```typescript
export interface GameSpecActionDef {
  // ... existing fields ...
  readonly tags?: readonly string[];  // NEW
}
```

### 2. Add `tags` to `ActionDef` in `types-core.ts`

```typescript
export interface ActionDef {
  // ... existing fields ...
  readonly tags?: readonly string[];  // NEW
}
```

### 3. Update `ActionDefSchema` in `schemas-core.ts`

Add `tags: z.array(StringSchema).optional()` to the action def Zod schema.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)

## Out of Scope

- Tag index compilation — ticket 003
- Ref resolution — tickets 004, 005
- Game spec migration — ticket 006

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes
2. `pnpm -F @ludoforge/engine test` — existing tests pass unchanged
3. Action definitions with and without `tags` compile without error

### Invariants

1. `tags` is optional — no breaking change for existing consumers
2. Existing action compilation continues to work identically

## Test Plan

### New/Modified Tests

1. No new test files — type-only change verified by typecheck

### Commands

1. `pnpm turbo typecheck` — type correctness
2. `pnpm -F @ludoforge/engine test` — full engine test suite
