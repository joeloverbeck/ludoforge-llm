# KERQUERY-006: Make query runtime cache explicit and EvalContext-owned

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel query runtime architecture
**Deps**: packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/effects-control.ts, packages/engine/src/kernel/effects-choice.ts, packages/engine/src/kernel/effects-subset.ts, packages/engine/src/kernel/declared-action-param-domain.ts, packages/engine/src/kernel/eval-value.ts, packages/engine/test/unit/eval-query.test.ts

## Problem

`tokenZones` caching currently relies on a module-level `WeakMap` in `eval-query.ts`. This hides cache lifecycle/ownership, makes architecture less explicit, and couples correctness to implicit object-identity assumptions rather than explicit eval-context contracts.

## Assumption Reassessment (2026-03-04)

1. Query evaluation already uses `EvalContext` as the canonical runtime dependency surface.
2. `eval-query.ts` currently holds module-global mutable cache state for `tokenZones`, instead of context-owned runtime cache state.
3. No active ticket in `tickets/*` currently scopes runtime cache ownership/lifecycle explicitly (`KERQUERY-004` and `KERQUERY-005` cover downstream contracts and transform contract registry, not runtime cache ownership).

## Architecture Check

1. Cache lifecycle should be explicit and owned by runtime context, not hidden in file-level mutable singletons.
2. This keeps the engine game-agnostic: no game-specific behavior, no `GameSpecDoc` or visual config coupling.
3. No alias/back-compat layer is needed; migrate directly to canonical context-owned cache.

## What to Change

### 1. Introduce explicit query runtime cache surface

1. Add a query-runtime cache type to `EvalContext` (for example token-zone index and future reusable query indexes).
2. Move `tokenZones` cache reads/writes behind this context-owned cache.

### 2. Remove module-global cache singleton

1. Remove the module-level `WeakMap` from `eval-query.ts`.
2. Ensure cache availability is explicit at all query call paths that can benefit from reuse.

### 3. Keep semantics unchanged while clarifying ownership

1. Preserve existing `tokenZones` output/error behavior.
2. Keep index semantics deterministic and game-agnostic.

## Files to Touch

- `packages/engine/src/kernel/eval-context.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/effects-control.ts` (modify if needed)
- `packages/engine/src/kernel/effects-choice.ts` (modify if needed)
- `packages/engine/src/kernel/effects-subset.ts` (modify if needed)
- `packages/engine/src/kernel/declared-action-param-domain.ts` (modify if needed)
- `packages/engine/src/kernel/eval-value.ts` (modify if needed)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)

## Out of Scope

- Query transform contract model redesign (covered by `KERQUERY-005`)
- Downstream consumer contract assertions (covered by `KERQUERY-004`)
- Any game-specific rules, data, or visual configuration changes

## Acceptance Criteria

### Tests That Must Pass

1. `tokenZones` behavior remains identical for output ordering, dedupe behavior, and error payloads.
2. Cache reuse works through explicit context-owned runtime cache (no module-global mutable singleton).
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query runtime cache ownership is explicit in `EvalContext`.
2. Runtime remains game-agnostic with no game-specific branching introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — verify token-zone cache behavior through context-owned cache path while preserving canonical semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`
