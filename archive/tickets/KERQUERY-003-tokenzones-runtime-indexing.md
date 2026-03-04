# KERQUERY-003: Optimize tokenZones lookup with reusable token-location indexing

**Status**: COMPLETED (2026-03-04)
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — query runtime performance path
**Deps**: packages/engine/src/kernel/eval-query.ts, packages/engine/test/unit/eval-query.test.ts

## Problem

`tokenZones` currently resolves each source token by scanning every zone, resulting in repeated O(tokens × zones) lookup cost per call. This is acceptable now but will degrade as transform queries become more common.

## Assumption Reassessment (2026-03-04)

1. Current `tokenZones` runtime loops all zones for each source token id.
2. Existing unit tests already cover core `tokenZones` semantics (default dedupe, `dedupe: false`, type mismatch context).
3. Query runtime context (`EvalContext`) already carries reusable runtime indexes (`runtimeTableIndex`), so adding query-level indexing follows established architecture.
4. No current architecture requires preserving the slower scan behavior.

## Architecture Check

1. Centralizing token-location indexing in query runtime helpers is cleaner than per-item ad hoc scans.
2. This is runtime infrastructure and remains game-agnostic.
3. No compatibility shim is needed; this is an internal optimization with behavior parity.

## What to Change

### 1. Add token-id to zone-id lookup utility

1. Build a deterministic token-id -> zone-id index once per `tokenZones` evaluation.
2. Resolve all source token ids through this index instead of per-item zone scans.

### 2. Preserve diagnostics and semantics

1. Keep existing error behavior when token ids are missing.
2. Keep output ordering semantics unchanged (source-order with optional dedupe).

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)

## Out of Scope

- Query contract redesign
- FITL event data changes

## Acceptance Criteria

### Tests That Must Pass

1. Existing `tokenZones` behavior tests still pass unchanged.
2. Add a deterministic complexity guard test proving `tokenZones` does not re-scan zone membership per source item.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. `tokenZones` output semantics remain stable.
2. Optimization introduces no game-specific assumptions or branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — retain existing output/error semantics coverage.
2. `packages/engine/test/unit/eval-query.test.ts` — add deterministic complexity guard via token id access counting for repeated `tokenZones` source items.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

1. Implemented deterministic token-id -> zone-id indexing in `eval-query.ts` and switched `tokenZones` to indexed lookup.
2. Preserved existing semantics:
   - Source-order output.
   - Default dedupe and `dedupe: false` behavior.
   - Existing type-mismatch and missing-token error behavior.
   - First-zone resolution when duplicate token ids exist across zones.
3. Added a deterministic complexity-guard unit test that counts token-id reads to ensure lookup is index-based rather than repeated per-item zone scans.
4. Scope adjustment vs original plan:
   - `eval-context.ts` changes were not required for this implementation.
   - No query contract or schema changes were needed.
5. Idealization follow-up implemented:
   - Added a query-runtime cache (`WeakMap` keyed by immutable `GameState`) so repeated `tokenZones` evaluations reuse the same token-zone index across calls, not just within one call.
