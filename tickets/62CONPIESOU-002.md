# 62CONPIESOU-002: Compiler lowering for `prioritized` query variant

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL compiler
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md

## Problem

The compiler cannot parse `prioritized` queries from authored YAML. Without compiler support, game authors cannot use the new query variant in Game Specs.

## Assumption Reassessment (2026-03-14)

1. Query lowering is in `packages/engine/src/cnl/compile-conditions-queries.ts` — a `switch` on `source.query` with one case per query kind. Confirmed (see `case 'concat':` at line 29).
2. The `concat` case is the closest structural precedent: it lowers an array of sub-queries recursively. `prioritized` is similar but with `tiers` array + optional `qualifierKey` string.
3. `ConditionLoweringRuntime.lowerQueryNode` is the recursive entry point for sub-query lowering.

## Architecture Check

1. The lowering follows the identical pattern as `concat`: iterate `tiers`, lower each sub-query recursively, assemble the result. The only addition is reading `qualifierKey` as an optional string.
2. Game-specific data stays in YAML — the compiler just reads `qualifierKey` as a plain string, no FITL concepts.
3. No shims — new case added to existing switch.

## What to Change

### 1. Add `case 'prioritized'` to `lowerQueryNode`

In `compile-conditions-queries.ts`, add a new case that:
- Validates `source.tiers` is a non-empty array
- Lowers each tier via `runtime.lowerQueryNode(tier, context, path)`
- Reads optional `source.qualifierKey` as a string
- Returns `{ query: 'prioritized', tiers, qualifierKey }` or error diagnostics

### 2. Handle edge cases

- Empty tiers array → emit diagnostic (matches spec requirement D)
- Non-string qualifierKey → emit diagnostic
- Each tier is lowered independently — tier lowering failures are reported per-tier

## Files to Touch

- `packages/engine/src/cnl/compile-conditions-queries.ts` (modify)

## Out of Scope

- Type definitions (ticket 001)
- Runtime evaluation (ticket 004)
- Validation diagnostics on compiled GameDef (ticket 003)
- Tier-aware legality (ticket 005)
- Any test files beyond build verification
- Card 87 YAML (ticket 008)
- `compile-conditions-shared.ts` changes (ticket 001 handles SUPPORTED_QUERY_KINDS)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. A YAML snippet with `query: prioritized` + `tiers` compiles without diagnostics (verified in ticket 006 tests, but basic smoke should be confirmed here)
3. A YAML snippet with empty `tiers: []` emits an error diagnostic
4. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. The compiler switch remains exhaustive — every `SUPPORTED_QUERY_KINDS` entry has a corresponding case
2. Tier sub-queries are lowered using the same `lowerQueryNode` recursion — no special handling
3. No FITL-specific identifiers in compiler source

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-conditions-queries.test.ts` (or nearest equivalent) — add cases for `prioritized` lowering: happy path, empty tiers, invalid qualifierKey

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
