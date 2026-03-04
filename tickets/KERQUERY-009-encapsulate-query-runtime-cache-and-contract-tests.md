# KERQUERY-009: Encapsulate query runtime cache API and harden cache contract tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — query cache abstraction boundary and query/runtime contract tests
**Deps**: archive/tickets/KERQUERY/KERQUERY-008-operation-scoped-eval-resources-and-query-cache-threading.md, packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/eval-query.ts, packages/engine/test/unit/eval-context.test.ts, packages/engine/test/unit/eval-query.test.ts

## Problem

`QueryRuntimeCache` currently exposes mutable internals (`WeakMap`) directly through public context types. This weakens architectural boundaries and makes it easy for unrelated code to bypass invariants. The cache surface should be a small explicit API with clear ownership and usage constraints.

## Assumption Reassessment (2026-03-04)

1. Query cache ownership is now explicit in `EvalContext` and no longer module-global.
2. Operation-scoped runtime resources now thread through both eval and effect context construction paths, eliminating mixed ownership patterns between preflight/discovery/execution surfaces.
3. Cache internals are still publicly reachable through structural types, so encapsulation is incomplete.
4. Existing tests cover tokenZones semantics and reuse/isolation behavior, but cache API boundary constraints are not comprehensively locked.

## Architecture Check

1. Encapsulating cache access behind explicit methods is cleaner than exposing mutable structures and scales better for future query indexes.
2. The abstraction remains generic runtime infrastructure; no game-specific data or GameSpecDoc/visual-config coupling is introduced.
3. No backwards compatibility layer is required; internal call sites should migrate directly to canonical cache API.

## What to Change

### 1. Replace public mutable cache internals with explicit API

1. Refactor `QueryRuntimeCache` into an opaque/cache-object style surface with explicit methods (for example get/set helpers for token-zone index).
2. Update `eval-query` and related runtime code to use the API exclusively.

### 2. Harden cache-boundary and behavior tests

1. Add tests that prevent direct structural dependence on internal storage shape.
2. Add regression tests for cache API behavior under expected runtime usage patterns.

### 3. Prepare for future query indexes

1. Ensure the cache API shape is extensible for new indexes without exposing internals.
2. Keep API naming/query-domain semantics generic (no game-specific terms beyond current query names).

## Files to Touch

- `packages/engine/src/kernel/eval-context.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/eval-context.test.ts` (modify/add)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)

## Out of Scope

- Runtime state-transition invalidation/immutability guards (`KERQUERY-007`)
- Runtime resource threading across eval/effect context constructors (already implemented)
- Any game-specific content, rules, or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. No kernel call site reads/writes raw cache internals directly.
2. Cache API preserves current tokenZones semantics and deterministic behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query cache ownership and mutation are constrained to explicit runtime cache API.
2. Runtime remains game-agnostic and reusable across arbitrary GameSpecDoc-defined games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-context.test.ts` — verify cache API contract and extensibility surface.
2. `packages/engine/test/unit/eval-query.test.ts` — verify token-zone index behavior through API path only.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
