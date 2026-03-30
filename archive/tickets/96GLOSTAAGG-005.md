# 96GLOSTAAGG-005: Implement `adjacentTokenAgg` compilation and evaluation gaps

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents compilation + evaluation only
**Deps**: 96GLOSTAAGG-001, 96GLOSTAAGG-002, `packages/engine/src/agents/policy-expr.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`

## Problem

`adjacentTokenAgg` is present in the policy type/schema surface but is not fully wired through compilation and runtime evaluation. Today authored policy YAML cannot compile this helper, and direct runtime evaluation fails closed with an unimplemented-expression error. That blocks adjacency-based state features such as "count US troops near Saigon".

## Assumption Reassessment (2026-03-30)

1. `queryAdjacentZones(graph: AdjacencyGraph, zone: ZoneId): readonly ZoneId[]` exists in `spatial.ts`. Confirmed.
2. `buildAdjacencyGraph(zones: readonly ZoneDef[]): AdjacencyGraph` exists and is already cached by `WeakMap` keyed on `def.zones`. Confirmed.
3. `AgentPolicyExpr`, kernel schema validation, and contracts already include `adjacentTokenAgg`. The missing gap is not type/schema definition; it is compiler analysis plus runtime evaluation. Confirmed.
4. `PolicyEvaluationContext` already receives `def`, `state`, and optional `runtime`, and already resolves zone references through the shared `resolvePolicyZoneId` helper used by `zoneProp` and `zoneTokenAgg`. Confirmed.
5. `resolveTokenFilter` and `matchesTokenFilter` already exist in `policy-evaluation-core.ts` and are the right reusable primitives for adjacency token filtering. Confirmed.
6. `anchorZone` should resolve through the existing shared zone-selector language. In current architecture that means selectors such as `frontier:actor`, `frontier:active`, `frontier:none`, or exact zone ids. Do not introduce a separate `self` alias for zone selectors.
7. `adjacentTokenAgg` does not need `zoneScope` or `zoneFilter`. The operator should stay narrow: resolve one anchor zone, fetch its direct neighbors, then aggregate matching tokens in those neighbor zones only.
8. The ticket's original proposal to add a second adjacency cache on `PolicyEvaluationContext` is not justified by current architecture. Runtime callers can already provide `runtime.adjacencyGraph`, and fallback `buildAdjacencyGraph(def.zones)` is already cached at the kernel layer.

## Architecture Check

1. `adjacentTokenAgg` must reuse the kernel's existing spatial infrastructure (`queryAdjacentZones`, `buildAdjacencyGraph`) rather than reimplement adjacency logic.
2. The cleanest implementation is to mirror `globalTokenAgg` behavior but narrow the iterated zone set to direct neighbors of one resolved anchor zone.
3. A new per-context adjacency cache would duplicate existing caching and add maintenance surface without solving a real performance problem. Prefer the existing runtime graph when supplied; otherwise rely on `buildAdjacencyGraph(def.zones)`.
4. This remains bounded, deterministic, immutable, and game-agnostic, satisfying Foundations #1, #5, #6, and #7.

## What to Change

### 1. Add `analyzeAdjacentTokenAggOperator` to `policy-expr.ts`

YAML input shape:
```yaml
adjacentTokenAgg:
  anchorZone: "saigon:none"     # shared zone-selector string, resolved at runtime
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
   Use existing zone-selector semantics. For player-scoped selectors, `actor`/`active` are supported; do not add a new `self` alias.
2. Use `this.input.runtime?.adjacencyGraph ?? buildAdjacencyGraph(this.input.def.zones)`.
3. Call `queryAdjacentZones(graph, anchorZoneId)` to get neighbor IDs.
4. Iterate tokens in neighbor zones, apply token filter, accumulate via aggOp.
5. Match existing aggregate semantics:
   - `count` returns `0` when nothing matches.
   - `sum` returns `0` when nothing matches.
   - `min`/`max` return `undefined` when nothing matches.

### 4. Wire into `evaluateExpr` dispatcher

Add `case 'adjacentTokenAgg'` to the switch in `PolicyEvaluationContext.evaluateExpr`.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify) — add analyzer, wire into dispatcher
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add evaluator and wire into dispatcher
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify) — compilation tests
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify) — evaluation tests

## Out of Scope

- `globalTokenAgg` expression (ticket 96GLOSTAAGG-003).
- `globalZoneAgg` expression (ticket 96GLOSTAAGG-004).
- Multi-anchor adjacency queries ("adjacent to any zone containing X") — spec non-goal.
- Graph traversal beyond immediate neighbors (BFS/DFS) — spec non-goal.
- Integration tests with FITL data (ticket 96GLOSTAAGG-006).
- Golden file updates (ticket 96GLOSTAAGG-006).
- Type, contract, or schema-surface additions unless implementation uncovers a real mismatch.
- Modifications to `spatial.ts` itself.
- Any runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. Compilation: valid `adjacentTokenAgg` with count compiles correctly.
2. Compilation: valid `adjacentTokenAgg` with sum + prop compiles correctly.
3. Compilation: missing `anchorZone` produces diagnostic error.
4. Compilation: `aggOp: sum` without `prop` produces diagnostic error.
5. Compilation: invalid `aggOp` produces diagnostic error.
6. Evaluation: count tokens in zones adjacent to anchor with a known adjacency graph and token placement.
7. Evaluation: sum token prop values in adjacent zones.
8. Evaluation: anchor zone with no neighbors returns 0.
9. Evaluation: anchor zone with neighbors but no matching tokens returns 0.
10. Evaluation: `actor`/`'active'` in `anchorZone` resolve correctly through the shared zone-selector runtime.
11. Evaluation: token filter `'self'` in props resolves correctly.
12. Evaluation: `min`/`max` preserve empty-input semantics (`undefined`, typically asserted via `coalesce` in score expressions).
13. Existing suite: targeted engine tests plus repo validation commands requested by the ticket.

### Invariants

1. Aggregation bounded by graph degree × tokens per zone (Foundation #6).
2. Pure and deterministic (Foundation #5).
3. No state mutation (Foundation #7).
4. No game-specific logic (Foundation #1).
5. `queryAdjacentZones` from `spatial.ts` is used as-is — no reimplementation.
6. Existing runtime graph plumbing remains the single source of truth; no duplicate adjacency cache is introduced in policy evaluation.
7. Existing expression kinds are unmodified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — `describe('adjacentTokenAgg compilation')`:
   - Valid count, valid sum with prop, missing anchorZone, missing prop for sum, invalid aggOp
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — `describe('adjacentTokenAgg evaluation')`:
   - Known adjacency graph with direct-neighbor coverage: count adjacent, sum adjacent prop, no neighbors, no matching tokens, actor/active anchor resolution plus tokenFilter self resolution, empty extrema semantics

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-30
- What actually changed:
  - Implemented `adjacentTokenAgg` analysis in `policy-expr.ts`.
  - Implemented `adjacentTokenAgg` evaluation in `policy-evaluation-core.ts`.
  - Centralized token-aggregation runtime semantics so `globalTokenAgg` and `adjacentTokenAgg` share the same empty/count/sum/min/max behavior.
  - Added adjacent compilation and evaluation coverage in the agent unit suites.
- Deviations from original plan:
  - Did not add new type/schema/contract surface because those pieces already existed.
  - Did not add a second adjacency-graph cache on `PolicyEvaluationContext`; the existing runtime graph plumbing plus `buildAdjacencyGraph` WeakMap cache already covers that concern cleanly.
  - Corrected the ticket's original `anchorZone` assumption from `self` to shared zone-selector semantics (`actor` / `active` / exact zone refs) to avoid introducing selector aliasing.
- Verification results:
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
