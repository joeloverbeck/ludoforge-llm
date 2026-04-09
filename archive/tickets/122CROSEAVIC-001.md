# 122CROSEAVIC-001: Add `seatAgg` variant to `AgentPolicyExpr` union and Zod schema

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types, kernel schemas
**Deps**: `specs/15-gamespec-agent-policy-ir.md`

## Problem

The `AgentPolicyExpr` union type has no variant for aggregating across game seats. All downstream tickets (compiler, evaluator, analyzer) depend on this type variant existing. This ticket adds the foundational type and schema infrastructure.

## Assumption Reassessment (2026-04-09)

1. `AgentPolicyExpr` is a discriminated union on `kind` at `packages/engine/src/kernel/types-core.ts:443` — confirmed.
2. Existing aggregation variants (`zoneTokenAgg`, `globalTokenAgg`, `globalZoneAgg`, `adjacentTokenAgg`) all use `AgentPolicyZoneTokenAggOp` for their `aggOp` field — confirmed. `seatAgg` reuses this type (`'sum' | 'count' | 'min' | 'max'`).
3. Zod discriminated union for `AgentPolicyExpr` lives in `packages/engine/src/kernel/schemas-core.ts` — confirmed.
4. `AgentPolicyZoneTokenAggOp` is defined in `packages/engine/src/contracts/policy-contract.ts:55` as `['sum', 'count', 'min', 'max']` — confirmed. No `avg` needed for v1.

## Architecture Check

1. The new variant follows the exact same pattern as existing aggregation variants (`globalTokenAgg`, etc.) — discriminated on `kind`, typed `aggOp`, recursive `expr` field.
2. Game-agnostic: the `over` field stores `'opponents' | 'all'` as keywords (resolved at evaluation time) or a validated `readonly string[]` of seat IDs. No game-specific seat names in engine code.
3. No backwards-compatibility shims — this is a purely additive change to the union type.

## What to Change

### 1. Add `seatAgg` variant to `AgentPolicyExpr` (types-core.ts)

Add a new union member after the `adjacentTokenAgg` variant (line ~490):

```typescript
| {
    readonly kind: 'seatAgg';
    readonly over: 'opponents' | 'all' | readonly string[];
    readonly expr: AgentPolicyExpr;
    readonly aggOp: AgentPolicyZoneTokenAggOp;
  }
```

### 2. Add Zod schema for `seatAgg` variant (schemas-core.ts)

Add a new branch to the Zod discriminated union that validates `AgentPolicyExpr`. The schema should validate:
- `kind: z.literal('seatAgg')`
- `over: z.union([z.literal('opponents'), z.literal('all'), z.array(z.string()).readonly()])`
- `expr`: recursive `AgentPolicyExpr` schema reference
- `aggOp`: reuse the existing `AgentPolicyZoneTokenAggOp` Zod schema

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)

## Out of Scope

- Compilation from authored YAML (ticket 003)
- Runtime evaluation (ticket 005)
- Static analysis / diagnostics (ticket 006)
- Schema artifact regeneration (ticket 008)

## Acceptance Criteria

### Tests That Must Pass

1. TypeScript compiles without errors — the new variant is type-safe within the existing union.
2. Zod schema accepts a well-formed `seatAgg` expression node and rejects malformed ones (missing `aggOp`, invalid `over`, etc.).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `AgentPolicyExpr` remains a discriminated union on `kind` — no ambiguous or overlapping variants.
2. All existing expression variants continue to compile and validate unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/schemas-core.test.ts` — add Zod parse/reject tests for `seatAgg` variant (if this file exists; otherwise inline validation in a new test file at `packages/engine/test/unit/kernel/seat-agg-schema.test.ts`)

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

Completion date: 2026-04-09

- Added the `seatAgg` variant to `AgentPolicyExpr` in `packages/engine/src/kernel/types-core.ts` with `over`, recursive `expr`, and shared `AgentPolicyZoneTokenAggOp` support.
- Added the matching Zod branch in `packages/engine/src/kernel/schemas-core.ts`.
- Added schema coverage in the live test surface `packages/engine/test/unit/schemas-top-level.test.ts` because the ticket's named `packages/engine/test/unit/kernel/schemas-core.test.ts` path does not exist in the current repo.
- Regenerated schema artifacts after the contract change. `packages/engine/schemas/GameDef.schema.json` changed; `packages/engine/schemas/Trace.schema.json` and `packages/engine/schemas/EvalReport.schema.json` were regenerated and remained in sync with no persisted diff.
- Required shared-union fallout extended beyond the original `Files to Touch`: `packages/engine/src/agents/policy-evaluation-core.ts` now handles `seatAgg` explicitly and fails closed with `undefined` until the later runtime-evaluation ticket lands. This was necessary to keep the widened `AgentPolicyExpr` union type-safe under `pnpm turbo typecheck` without preempting ticket 005's runtime work.

### Verification

- `pnpm -F @ludoforge/engine test`
- `pnpm turbo typecheck`

### Boundary Notes

- The test-file path in the original ticket was stale; schema assertions now live in `packages/engine/test/unit/schemas-top-level.test.ts`.
- The original out-of-scope note for schema artifact regeneration was stale relative to the live repo contract surface. Adding a new `AgentPolicyExpr` union member required regenerating the owned schema artifacts in the same change.
- No compiler, analyzer, or real `seatAgg` runtime evaluation logic landed here. That scope remains deferred to sibling tickets.
