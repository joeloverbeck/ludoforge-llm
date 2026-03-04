# KERQUERY-001: Align tokenZones static contracts with runtime output

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — query contract inference and static diagnostics
**Deps**: packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/query-kind-map.ts, packages/engine/src/kernel/query-domain-kinds.ts, packages/engine/src/kernel/query-shape-inference.ts

## Problem

`tokenZones` returns zone ids (strings) at runtime, but current static inference paths classify it as token-domain/token-shape because it is treated as recursive and inferred from source leaves. This creates contract drift between compile-time diagnostics and runtime behavior.

## Assumption Reassessment (2026-03-04)

1. `evalQuery` for `tokenZones` emits zone ids, not tokens.
2. `query-kind-map` currently marks `tokenZones` as recursive, so static domain/shape inference reflects source leaf kinds rather than transformed output.
3. Current unit tests encode this mismatch and must be corrected alongside implementation.

## Architecture Check

1. A query transform must own its output contract explicitly; this is cleaner than inheriting source contracts from recursion.
2. This remains game-agnostic and applies to the generic query AST/runtime only.
3. No compatibility shim is required; we should enforce the correct contract now.

## What to Change

### 1. Make tokenZones output contract explicit

1. Update query contract mapping/inference so `tokenZones` is classified with zone/string output semantics.
2. Ensure domain- and shape-inference APIs return results consistent with runtime behavior.

### 2. Update tests to reflect corrected contract

1. Replace token-domain expectations for `tokenZones` with zone-domain expectations.
2. Replace token runtime-shape expectations with string runtime-shape expectations.

## Files to Touch

- `packages/engine/src/kernel/query-kind-map.ts` (modify)
- `packages/engine/src/kernel/query-domain-kinds.ts` (modify)
- `packages/engine/src/kernel/query-shape-inference.ts` (modify)
- `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` (modify)
- `packages/engine/test/unit/query-shape-inference.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (modify if needed)

## Out of Scope

- New game rules or event card content changes
- Visual runner/UI behavior

## Acceptance Criteria

### Tests That Must Pass

1. Domain inference reports `tokenZones` as zone-domain.
2. Runtime-shape inference reports `tokenZones` as string-shape.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Static query contracts and runtime query outputs must agree for every query kind.
2. Contract inference remains game-agnostic and independent of FITL-specific content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` — verifies corrected domain contract for `tokenZones`.
2. `packages/engine/test/unit/query-shape-inference.test.ts` — verifies corrected runtime shape for `tokenZones`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/query-domain-kinds.test.js packages/engine/dist/test/unit/query-shape-inference.test.js`
3. `pnpm -F @ludoforge/engine test`
