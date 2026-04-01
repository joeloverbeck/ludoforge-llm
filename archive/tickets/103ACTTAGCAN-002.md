# 103ACTTAGCAN-002: Add `CompiledActionTagIndex` type, Zod schema, and `GameDef.actionTagIndex`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `types-core.ts`, `schemas-core.ts`
**Deps**: `archive/tickets/103ACTTAGCAN-001.md`, `specs/103-action-tags-and-candidate-metadata.md`

## Problem

The compiled tag index type and its Zod schema must exist before compilation or ref resolution code can reference them. The `GameDef` must include an optional `actionTagIndex` field to carry the compiled index.

## Assumption Reassessment (2026-04-01)

1. `GameDef` at `types-core.ts:724-761` — confirmed. No `actionTagIndex` field.
2. `GameDefSchema` at `schemas-core.ts:993-1033` — confirmed. No `actionTagIndex` schema.
3. No `CompiledActionTagIndex` type exists — confirmed.

## Architecture Check

1. Tag index lives on `GameDef` (not `AgentPolicyCatalog`) because tags are action metadata — a game-level concept that agents reference but don't own.
2. `actionTagIndex` is optional — games with no tagged actions produce `undefined`.
3. Both `byAction` and `byTag` maps use sorted arrays for determinism (Foundation 8).

## What to Change

### 1. Add `CompiledActionTagIndex` to `types-core.ts`

```typescript
export interface CompiledActionTagIndex {
  readonly byAction: Readonly<Record<string, readonly string[]>>;
  readonly byTag: Readonly<Record<string, readonly string[]>>;
}
```

### 2. Add `actionTagIndex` to `GameDef`

```typescript
export interface GameDef {
  // ... existing fields ...
  readonly actionTagIndex?: CompiledActionTagIndex;
}
```

### 3. Add Zod schema to `schemas-core.ts`

```typescript
const CompiledActionTagIndexSchema = z.object({
  byAction: z.record(StringSchema, z.array(StringSchema)),
  byTag: z.record(StringSchema, z.array(StringSchema)),
}).strict();
```

Update `GameDefSchema` to include `actionTagIndex: CompiledActionTagIndexSchema.optional()`.

### 4. Regenerate `GameDef.schema.json`

Run `pnpm -F @ludoforge/engine run schema:artifacts`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)

## Out of Scope

- Tag index compilation logic — ticket 003
- Ref kinds — ticket 004
- Game spec migration — ticket 006

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes
2. `pnpm -F @ludoforge/engine run schema:artifacts:check` passes (idempotent)
3. `pnpm -F @ludoforge/engine test` — existing tests pass unchanged
4. `GameDef.schema.json` includes `actionTagIndex` in the schema

### Invariants

1. `actionTagIndex` is optional — no breaking change
2. Existing `GameDef` consumers unaffected

## Test Plan

### New/Modified Tests

1. No new test files — type-only change verified by typecheck and schema artifacts

### Commands

1. `pnpm turbo typecheck` — type correctness
2. `pnpm -F @ludoforge/engine run schema:artifacts` — regenerate schema
3. `pnpm -F @ludoforge/engine test` — full engine test suite
