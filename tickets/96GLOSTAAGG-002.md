# 96GLOSTAAGG-002: Implement token filter, zone filter, and zone scope matching helpers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (evaluation helpers)
**Deps**: 96GLOSTAAGG-001, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/kernel/types-core.ts`

## Problem

The three new aggregation expression kinds all need shared matching logic: filtering tokens by type/props, filtering zones by category/attribute/variable, and scoping zones to board/aux/all. These helpers must be implemented and thoroughly tested before any expression evaluation can be built.

## Assumption Reassessment (2026-03-30)

1. `policy-evaluation-core.ts` already has `resolveZoneTokenAggOwner()` for the existing `zoneTokenAgg` expression — the new token filter is a generalization that replaces the `owner` concept with generic prop filtering.
2. Zone definitions (`ZoneDef`) have `id`, `kind` (`'board' | 'aux'`), `category?`, and `attributes?` fields — confirmed in `types-core.ts`.
3. Zone variables live in `state.zoneVars[zoneId]` as `Record<string, number>` — confirmed by kernel state shape.
4. Token shape includes `type: string` and `props: Record<string, unknown>` — the filter matches against these.
5. `'self'`/`'active'` resolution for token filter props needs the same `PlayerId` resolution that `resolveZoneTokenAggOwner` uses.

## Architecture Check

1. Extracting matching helpers as standalone, exported pure functions makes them independently testable and reusable across all three expression evaluators. This is cleaner than inlining filter logic in each evaluator method.
2. All helpers are pure functions of game state — no side effects, no mutations, no game-specific logic. Foundation #1 and #7 preserved.
3. No backwards-compatibility shims. The existing `zoneTokenAgg` evaluator is not modified in this ticket.

## What to Change

### 1. Add `resolveTokenFilter` helper

Resolves `'self'`/`'active'` strings in token filter prop values to concrete `PlayerId` strings. Returns a resolved copy of the filter.

```typescript
export function resolveTokenFilter(
  filter: AgentPolicyTokenFilter | undefined,
  playerId: PlayerId,
  state: GameState,
): ResolvedTokenFilter | undefined
```

### 2. Add `matchesTokenFilter` helper

Tests whether a single token matches a resolved token filter.

```typescript
export function matchesTokenFilter(
  token: Token,
  filter: ResolvedTokenFilter | undefined,
): boolean
```

Logic:
- If filter is undefined, return true (all tokens match).
- If `filter.type` is set, token.type must equal it.
- If `filter.props` is set, every key/value pair must match: `token.props[key] === filter.props[key].eq`.

### 3. Add `matchesZoneScope` helper

Tests whether a zone definition matches the requested zone scope.

```typescript
export function matchesZoneScope(
  zoneDef: ZoneDef,
  scope: AgentPolicyZoneScope,
): boolean
```

Logic:
- `'board'` → `zoneDef.kind === 'board'`
- `'aux'` → `zoneDef.kind === 'aux'`
- `'all'` → `true`

### 4. Add `matchesZoneFilter` helper

Tests whether a zone matches a zone filter, given the current game state (for variable lookups).

```typescript
export function matchesZoneFilter(
  zoneDef: ZoneDef,
  filter: AgentPolicyZoneFilter | undefined,
  state: GameState,
): boolean
```

Logic:
- If filter is undefined, return true.
- If `filter.category` is set, `zoneDef.category` must equal it.
- If `filter.attribute` is set, evaluate `zoneDef.attributes[prop] <op> value`.
- If `filter.variable` is set, evaluate `state.zoneVars[zoneId][prop] <op> value`.
- All conditions are AND-combined (compound filter).

### 5. Add `applyComparisonOp` internal helper

Shared numeric/string/boolean comparison for filter ops (`eq`, `gt`, `gte`, `lt`, `lte`).

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add exported helper functions
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify) — add unit tests for all helpers

## Out of Scope

- Expression evaluation methods (`evaluateGlobalTokenAggregate`, etc.) — tickets 003/004/005.
- Compilation/analysis in `policy-expr.ts` — tickets 003/004/005.
- Modifying the existing `zoneTokenAgg` evaluator to use the new helpers (optional future refactor).
- Changes to `types-core.ts` or `policy-contract.ts` (done in 001).
- Any runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. `matchesTokenFilter` correctly matches/rejects tokens by type, by props, by type+props combined, and with undefined filter (match-all).
2. `resolveTokenFilter` correctly resolves `'self'` and `'active'` in prop values to concrete player ID strings.
3. `matchesZoneScope` correctly filters by `'board'`, `'aux'`, and `'all'`.
4. `matchesZoneFilter` correctly filters by category, attribute condition (all 5 ops), variable condition (all 5 ops), and compound (category + attribute).
5. Edge cases: empty token props, missing zone attributes, missing zone variables, zero-value comparisons.
6. Existing suite: `pnpm turbo test`

### Invariants

1. All helpers are pure functions — no state mutation (Foundation #7).
2. No game-specific logic in any helper — filters are generic (Foundation #1).
3. Existing `zoneTokenAgg` and `zoneProp` evaluation is untouched — no regressions.
4. `matchesZoneFilter` with undefined filter returns true (no filter = match all).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — add a `describe('filter and scope matching helpers')` block with:
   - `matchesTokenFilter`: type-only, props-only, type+props, undefined filter, non-matching type, non-matching prop value
   - `resolveTokenFilter`: self resolution, active resolution, literal values pass through, undefined filter
   - `matchesZoneScope`: board-only, aux-only, all
   - `matchesZoneFilter`: category, attribute eq/gt/gte/lt/lte, variable eq/gt/gte/lt/lte, compound, undefined filter
   - Edge cases: empty props, missing attributes, missing zoneVars entry

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "filter and scope matching helpers"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
