# 62CONPIESOU-004: Implement `evalQuery` handler for `prioritized` with tier-index metadata

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime (eval-query)
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md

## Problem

`evalQuery` has no handler for the `prioritized` variant. The runtime must evaluate each tier's sub-query, concatenate results, and attach internal tier-index metadata so that downstream legality (ticket 005) can enforce tier priority.

## Assumption Reassessment (2026-03-14)

1. `evalQuery` in `packages/engine/src/kernel/eval-query.ts` is a large switch (lines 688-955). Each case returns `readonly QueryResult[]`. Confirmed.
2. `QueryResult` items are the union of different result types (tokens, zones, integers, strings, etc.). There is no existing metadata-tagging mechanism — tier index must be introduced.
3. The spec says tier metadata is "runtime metadata, not exposed in authored YAML." This means it needs an internal tagging mechanism — either a side-channel map or a wrapper type.
4. The `concat` case (line 692) iterates sources, concatenates results, and validates shape homogeneity. `prioritized` is similar but must also tag results.
5. The `qualifierKey` is not used in `evalQuery` — it's only used in legality (ticket 005). `evalQuery` just needs to tag each result with its tier index.

## Architecture Check

1. **Tier metadata approach**: Two options — (a) attach tier index as a property on QueryResult items, or (b) maintain a separate `Map<QueryResult, number>` (tier index map) returned alongside the results. Option (b) is cleaner because it doesn't modify the QueryResult type. However, option (a) avoids identity-based lookups. Choose based on existing patterns — if QueryResult items already carry metadata, extend that; otherwise use a side-channel.
2. The side-channel (tier metadata) must flow from `evalQuery` through to `chooseN` in `effects-choice.ts`. This likely means `evalQuery` returns an enriched result for `prioritized` queries, or the query AST itself is passed through to legality computation.
3. **Simpler alternative**: Don't tag individual results. Instead, pass the `prioritized` query AST through to legality, and let legality re-evaluate each tier to determine tier membership. This avoids modifying QueryResult at all. Legality already has access to the query AST via the chooseN effect. This approach is recommended — it matches the existing pattern where legality re-reads the query to understand structure.

## What to Change

### 1. Add `case 'prioritized'` to `evalQuery`

In `eval-query.ts`:
- Evaluate each tier sub-query via recursive `evalQuery(tier, ctx)`
- Concatenate all results (same shape-validation logic as `concat`)
- Return the flat array

### 2. Expose tier-membership lookup utility

Create a helper function (in `eval-query.ts` or a new `prioritized-tier-utils.ts`):

```typescript
export function computeTierMembership(
  query: PrioritizedOptionsQuery,
  ctx: ReadContext,
): ReadonlyMap<string, number> // result-key → tier-index
```

This function re-evaluates each tier and maps each result to its tier index. It is called by legality (ticket 005), not by `evalQuery` itself. This keeps `evalQuery` return type unchanged.

### 3. Handle deduplication across tiers

If the same item appears in multiple tiers (e.g., a token matches both tier-1 and tier-2 filters), it should be assigned to the **lowest** (highest-priority) tier and not duplicated. Document this behavior.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/prioritized-tier-utils.ts` (new — tier membership utility)

## Out of Scope

- Type definitions (ticket 001)
- Compiler lowering (ticket 002)
- Validation (ticket 003)
- Tier-aware legality in chooseN (ticket 005 — consumes the utility created here)
- Card 87 YAML (ticket 008)
- Test files (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. `evalQuery` on a `prioritized` query with 2 tiers returns the concatenation of both tiers' results
3. `evalQuery` on a `prioritized` query with an empty tier skips it, returns results from non-empty tiers
4. `evalQuery` on a `prioritized` query deduplicates items appearing in multiple tiers (lowest tier wins)
5. `computeTierMembership` returns correct tier index for each result item
6. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. `evalQuery` return type remains `readonly QueryResult[]` — no type signature change
2. Tier evaluation order is deterministic: tier 0 first, tier 1 second, etc.
3. Shape homogeneity across tiers is enforced (same as `concat`)
4. No FITL-specific identifiers in any touched file
5. `assertWithinBounds` limit enforcement applies to the combined result set

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — add `prioritized` evaluation cases (see ticket 006 for full test list)

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
