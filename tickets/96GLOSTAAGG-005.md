# 96GLOSTAAGG-005: Implement `adjacentTokenAgg` expression compilation and evaluation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (compilation + evaluation), kernel spatial dependency
**Deps**: 96GLOSTAAGG-001, 96GLOSTAAGG-002, `packages/engine/src/agents/policy-expr.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/kernel/spatial.ts`

## Problem

There is no way for PolicyAgent state features to aggregate tokens in zones adjacent to a named anchor zone. The `adjacentTokenAgg` expression kind enables threat assessment queries like "count US troops near Saigon" — bounded by graph degree (typically 3-6 neighbors), making it cheaper than global aggregation.

## Assumption Reassessment (2026-03-30)

1. `queryAdjacentZones(graph: AdjacencyGraph, zone: ZoneId): readonly ZoneId[]` exists in `spatial.ts` — returns neighbor zone IDs for a given zone. Confirmed.
2. `buildAdjacencyGraph(zones: readonly ZoneDef[]): AdjacencyGraph` exists and is cached via WeakMap. Confirmed.
3. `PolicyEvaluationContext` receives `def: GameDef` and `state: GameState` — it has access to `def.zones` for building the adjacency graph and `state.zones[zoneId]` for reading tokens.
4. The anchor zone string supports `'self'`/`'active'` owner resolution in the same style as zone references elsewhere (e.g., `hand:self` → `hand:<playerId>`).
5. The helpers from 96GLOSTAAGG-002 (`matchesTokenFilter`, `resolveTokenFilter`) are available for token filtering.
6. `adjacentTokenAgg` does NOT need `zoneScope` or `zoneFilter` — it operates only on neighbor zones as determined by the adjacency graph. The spec confirms this.

## Architecture Check

1. `adjacentTokenAgg` reuses the kernel's existing spatial infrastructure (`buildAdjacencyGraph`, `queryAdjacentZones`) rather than reimplementing adjacency logic. This is the correct layering — spatial queries belong to the kernel, and the agent evaluation layer calls into them.
2. Bounded by graph degree (typically 3-6 neighbors × tokens per zone) — Foundation #6.
3. Pure read-only — Foundation #5 and #7.
4. No game-specific logic — anchor zone, token filter are all parameterized (Foundation #1).
5. The adjacency graph can be built once and cached for the duration of policy evaluation (same `def.zones` reference).

## What to Change

### 1. Add `analyzeAdjacentTokenAggOperator` to `policy-expr.ts`

YAML input shape:
```yaml
adjacentTokenAgg:
  anchorZone: "saigon:none"     # zone ID, supports owner resolution
  tokenFilter:
    type: troop
    props: { seat: { eq: us } }
  aggOp: count
  prop: strength                 # required for sum/min/max
```

Validation:
- `anchorZone` must be a non-empty string.
- `aggOp` must be one of `count | sum | min | max`.
- `prop` is required when `aggOp` is `sum | min | max`.
- `tokenFilter` is optional.

Returns `PolicyExprAnalysis` with `valueType: 'number'`, `costClass: 'state'`.

### 2. Wire into `analyzePolicyExpr` dispatcher

Add `'adjacentTokenAgg'` to the `KnownOperator` set and the switch statement.

### 3. Add `evaluateAdjacentTokenAggregate` to `policy-evaluation-core.ts`

Steps:
1. Resolve `anchorZone` string to a `ZoneId` (handle `'self'`/`'active'` owner segments via existing `resolvePolicyZoneId` or equivalent).
2. Build adjacency graph from `this.input.def.zones` (cached).
3. Call `queryAdjacentZones(graph, anchorZoneId)` to get neighbor IDs.
4. Iterate tokens in neighbor zones, apply token filter, accumulate via aggOp.
5. Return result (0 for empty).

The adjacency graph should be built lazily and cached on the `PolicyEvaluationContext` instance to avoid rebuilding it per-expression.

### 4. Wire into `evaluateExpr` dispatcher

Add `case 'adjacentTokenAgg'` to the switch in `PolicyEvaluationContext.evaluateExpr`.

### 5. Cache adjacency graph on PolicyEvaluationContext

Add a private lazy-initialized `adjacencyGraph` field to `PolicyEvaluationContext` that calls `buildAdjacencyGraph(this.input.def.zones)` on first access.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify) — add analyzer, wire into dispatcher
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add evaluator, wire into dispatcher, add adjacency graph caching
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify) — compilation tests
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify) — evaluation tests

## Out of Scope

- `globalTokenAgg` expression (ticket 96GLOSTAAGG-003).
- `globalZoneAgg` expression (ticket 96GLOSTAAGG-004).
- Multi-anchor adjacency queries ("adjacent to any zone containing X") — spec non-goal.
- Graph traversal beyond immediate neighbors (BFS/DFS) — spec non-goal.
- Integration tests with FITL data (ticket 96GLOSTAAGG-006).
- Golden file updates (ticket 96GLOSTAAGG-006).
- Schema JSON updates.
- Modifications to `spatial.ts` itself.
- Any runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. Compilation: valid `adjacentTokenAgg` with count compiles correctly.
2. Compilation: valid `adjacentTokenAgg` with sum + prop compiles correctly.
3. Compilation: missing `anchorZone` produces diagnostic error.
4. Compilation: `aggOp: sum` without `prop` produces diagnostic error.
5. Compilation: invalid `aggOp` produces diagnostic error.
6. Evaluation: count tokens in zones adjacent to anchor (3-zone triangle graph, known token placement).
7. Evaluation: sum token prop values in adjacent zones.
8. Evaluation: anchor zone with no neighbors returns 0.
9. Evaluation: anchor zone with neighbors but no matching tokens returns 0.
10. Evaluation: `'self'`/`'active'` in anchorZone owner segment resolves correctly.
11. Evaluation: token filter `'self'` in props resolves correctly.
12. Existing suite: `pnpm turbo test`

### Invariants

1. Aggregation bounded by graph degree × tokens per zone (Foundation #6).
2. Pure and deterministic (Foundation #5).
3. No state mutation (Foundation #7).
4. No game-specific logic (Foundation #1).
5. `queryAdjacentZones` from `spatial.ts` is used as-is — no reimplementation.
6. Adjacency graph is built at most once per `PolicyEvaluationContext` instance.
7. Existing expression kinds are unmodified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — `describe('adjacentTokenAgg compilation')`:
   - Valid count, valid sum with prop, missing anchorZone, missing prop for sum, invalid aggOp
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — `describe('adjacentTokenAgg evaluation')`:
   - Triangle graph with known tokens: count adjacent, sum adjacent prop, no neighbors, no matching tokens, self/active resolution in anchorZone and tokenFilter

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "adjacentTokenAgg"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
