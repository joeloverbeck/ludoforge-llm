# 62CONPIESOU-001: Add `prioritized` variant to OptionsQuery type union and Zod schema

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel type definitions, Zod schema, query-kind-map
**Deps**: None (foundation ticket)

## Problem

The `OptionsQuery` union has no variant for ordered-tier sourcing. All downstream tickets depend on this type existing in the IR and being recognized by the schema validation layer.

## Assumption Reassessment (2026-03-14)

1. `OptionsQuery` union is in `packages/engine/src/kernel/types-ast.ts` (lines 203-265) — 20 existing variants. Confirmed.
2. Zod schema for `OptionsQuery` is in `packages/engine/src/kernel/schemas-ast.ts` (line 220, `optionsQuerySchemaInternal = z.union([...])`) — lazy recursive schema. Confirmed.
3. `SUPPORTED_QUERY_KINDS` array in `packages/engine/src/cnl/compile-conditions-shared.ts` (lines 52-72) lists all query discriminants. Must add `'prioritized'`.
4. `OPTIONS_QUERY_KIND_CONTRACT_MAP` in `packages/engine/src/kernel/query-kind-map.ts` (line 85) maps each query kind to its contract. `prioritized` is recursive (like `concat`), not a leaf.
5. `ast-builders.ts` may have builder helpers — check and add if pattern exists.
6. `ast-to-display.ts` may need a display case — check and add if pattern exists.

## Architecture Check

1. The `prioritized` variant follows the exact same recursive-union pattern as `concat`: it contains sub-queries as tiers. Adding it as `{ partition: 'recursive' }` in the query-kind-map is consistent.
2. `qualifierKey` is an optional string — no game-specific concepts leak into the type system. Any game can use any token property name.
3. No backwards-compatibility shims needed — this is a new variant.

## What to Change

### 1. Add `prioritized` variant to `OptionsQuery` type union

In `types-ast.ts`, add to the union:

```typescript
| {
    readonly query: 'prioritized';
    readonly tiers: readonly [OptionsQuery, ...OptionsQuery[]];
    readonly qualifierKey?: string;
  }
```

### 2. Add Zod schema variant

In `schemas-ast.ts`, add to `optionsQuerySchemaInternal` union:

```typescript
z.object({
  query: z.literal('prioritized'),
  tiers: z.array(OptionsQuerySchema).min(1),
  qualifierKey: StringSchema.optional(),
}).strict(),
```

### 3. Register in SUPPORTED_QUERY_KINDS

In `compile-conditions-shared.ts`, add `'prioritized'` to the array.

### 4. Register in OPTIONS_QUERY_KIND_CONTRACT_MAP

In `query-kind-map.ts`, add:

```typescript
prioritized: { partition: 'recursive' },
```

### 5. Update ast-builders.ts and ast-to-display.ts

Add builder helper and display case if those files have entries for other recursive queries like `concat`.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/cnl/compile-conditions-shared.ts` (modify)
- `packages/engine/src/kernel/query-kind-map.ts` (modify)
- `packages/engine/src/kernel/ast-builders.ts` (modify — if builder pattern exists)
- `packages/engine/src/kernel/ast-to-display.ts` (modify — if display case needed)

## Out of Scope

- Runtime evaluation logic (ticket 004)
- Compiler lowering from YAML (ticket 002)
- Validation diagnostics (ticket 003)
- Tier-aware legality (ticket 005)
- Any test files (tickets 006-009)
- Card 87 YAML changes (ticket 008)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds — no type errors from the new union member
2. `pnpm turbo typecheck` succeeds
3. Existing test suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. The `OptionsQuery` union remains a discriminated union on `query` field
2. Zod schema and TypeScript type stay in sync — every TS variant has a matching Zod member
3. `SUPPORTED_QUERY_KINDS` and `OPTIONS_QUERY_KIND_CONTRACT_MAP` cover every variant in the union
4. No FITL-specific identifiers appear in any touched file

## Test Plan

### New/Modified Tests

1. No new test files in this ticket — the type system is exercised by build + typecheck

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`
