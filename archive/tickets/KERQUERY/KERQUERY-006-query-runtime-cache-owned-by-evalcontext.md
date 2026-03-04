# KERQUERY-006: Make query runtime cache explicit and EvalContext-owned

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel query runtime architecture
**Deps**: packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/effect-context.ts, packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/action-applicability-preflight.ts, packages/engine/src/kernel/action-actor.ts, packages/engine/src/kernel/action-executor.ts, packages/engine/src/kernel/condition-annotator.ts, packages/engine/src/kernel/legal-moves.ts, packages/engine/src/kernel/terminal.ts, packages/engine/src/agents/evaluate-state.ts, packages/engine/test/unit/eval-query.test.ts

## Problem

`tokenZones` caching currently relies on module-level mutable cache state in `eval-query.ts` (`WeakMap` keyed by state object identity). This hides cache lifecycle/ownership, makes architecture less explicit, and couples correctness to implicit file-level singleton behavior instead of runtime-context contracts.

## Assumption Reassessment (2026-03-04)

1. Query evaluation already uses `EvalContext` as the canonical runtime dependency surface.
2. `eval-query.ts` currently contains module-global mutable cache state for `tokenZones` via `WeakMap`.
3. `KERQUERY-007` is now active and adjacent, but it is about cache validity invariants/state transitions. `KERQUERY-006` must stay focused on ownership/lifecycle placement (context-owned cache).
4. Existing `eval-query` tests already cover tokenZones semantics plus same-state reuse behavior; this ticket should preserve semantics while relocating ownership.

## Architecture Check

1. Cache lifecycle should be explicit and runtime-context-owned, not hidden behind file-level singleton mutable state.
2. Context-owned cache makes dependencies explicit at evaluation boundaries and supports future query indexes without widening hidden globals.
3. This remains game-agnostic: no game-specific behavior, no `GameSpecDoc`/asset coupling.
4. No alias/back-compat shim is required; use the canonical context-owned runtime cache contract and fix call sites.

## What to Change

### 1. Introduce explicit query runtime cache surface

1. Add a query-runtime cache contract in `EvalContext` (starting with token-zone lookup storage and extensible for future indexes).
2. Ensure `EffectContext` includes/provides the same cache contract so effect/runtime call paths satisfy `EvalContext` without hidden defaults.

### 2. Remove module-global cache singleton

1. Remove module-level `WeakMap` cache from `eval-query.ts`.
2. Route `tokenZones` cache reads/writes through `ctx` runtime cache only.

### 3. Keep semantics unchanged while clarifying ownership

1. Preserve `tokenZones` output ordering, dedupe behavior, and error payloads.
2. Preserve same-state cache reuse semantics through context-owned cache.

### 4. Keep scope aligned with adjacent ticket

1. Do not add state-transition invalidation policy/guards here; those belong to `KERQUERY-007`.

## Files to Touch

- `packages/engine/src/kernel/eval-context.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/action-actor.ts` (modify)
- `packages/engine/src/kernel/action-executor.ts` (modify)
- `packages/engine/src/kernel/condition-annotator.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/terminal.ts` (modify)
- `packages/engine/src/agents/evaluate-state.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)

## Out of Scope

- Cache validity invariants across state transitions / immutability guards (`KERQUERY-007`)
- Query transform contract model redesign (covered by `KERQUERY-005`)
- Downstream consumer contract assertions (covered by `KERQUERY-004`)
- Any game-specific rules, data, or visual configuration changes

## Acceptance Criteria

### Tests That Must Pass

1. `tokenZones` behavior remains identical for output ordering, dedupe behavior, and error payloads.
2. Cache reuse works through explicit context-owned runtime cache (no module-global mutable singleton).
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query runtime cache ownership is explicit in `EvalContext` and satisfied by runtime effect contexts.
2. Runtime remains game-agnostic with no game-specific branching introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — verify token-zone cache behavior through context-owned cache path while preserving canonical semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-03-04
- **What changed**:
  - Added explicit `QueryRuntimeCache` + `createQueryRuntimeCache()` to `EvalContext`.
  - Added canonical `createEvalContext()` factory to centralize `EvalContext` construction defaults (`collector`, `queryRuntimeCache`) and reduce constructor drift.
  - Added `queryRuntimeCache` to `EffectContext` and defaulted it in effect-context factories, so runtime/effect call paths satisfy `EvalContext` structurally.
  - Removed module-level `WeakMap` cache singleton from `eval-query.ts`; `tokenZones` cache now reads/writes via `ctx.queryRuntimeCache`.
  - Updated direct runtime `EvalContext` construction sites in engine/kernel modules to use `createEvalContext()`.
  - Updated unit/integration test context builders to provide explicit runtime cache.
  - Added `eval-context` unit coverage for default/override construction behavior.
  - Added `eval-query` coverage for cross-context cache ownership (`does not reuse token zone lookup across different eval contexts`).
- **Deviations from original plan**:
  - Scope expanded to update additional direct `EvalContext` constructors and test helpers beyond the initial dependency list, required by strict type contracts once ownership became explicit.
  - Kept `KERQUERY-007` concerns out of scope (no transition invalidation policy added here).
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node packages/engine/dist/test/unit/eval-query.test.js` passed.
  - `node --test packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/eval-query.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (378/378).
  - `pnpm -F @ludoforge/engine lint` passed.
