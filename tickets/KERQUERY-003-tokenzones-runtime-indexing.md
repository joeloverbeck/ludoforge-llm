# KERQUERY-003: Optimize tokenZones lookup with reusable token-location indexing

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — query runtime performance path
**Deps**: packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/eval-context.ts

## Problem

`tokenZones` currently resolves each source token by scanning every zone, resulting in repeated O(tokens × zones) lookup cost per call. This is acceptable now but will degrade as transform queries become more common.

## Assumption Reassessment (2026-03-04)

1. Current `tokenZones` runtime loops all zones for each source token id.
2. Query runtime already centralizes context (`EvalContext`) and can host reusable indexes.
3. No current architecture requires preserving the slower scan behavior.

## Architecture Check

1. Centralizing token-location indexing in eval context is cleaner than per-query ad hoc scans.
2. This is runtime infrastructure and remains game-agnostic.
3. No compatibility shim is needed; this is an internal optimization with behavior parity.

## What to Change

### 1. Add token-id to zone-id lookup utility

1. Build a deterministic token-location index once per relevant eval path.
2. Reuse this index in `tokenZones` (and other token-zone queries where appropriate).

### 2. Preserve diagnostics and semantics

1. Keep existing error behavior when token ids are missing.
2. Keep output ordering semantics unchanged (source-order with optional dedupe).

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/eval-context.ts` (modify if needed)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)

## Out of Scope

- Query contract redesign
- FITL event data changes

## Acceptance Criteria

### Tests That Must Pass

1. Existing `tokenZones` behavior tests still pass unchanged.
2. Performance-oriented regression test (or deterministic complexity guard) verifies index reuse path executes.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. `tokenZones` output semantics remain stable.
2. Optimization introduces no game-specific assumptions or branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — ensure identical output/error semantics post-optimization.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`
