# KERQUERY-001: Align tokenZones static contracts with runtime output

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium-High
**Engine Changes**: Yes — query contract inference and static diagnostics
**Deps**: packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/query-kind-map.ts, packages/engine/src/kernel/query-walk.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts

## Problem

`tokenZones` returns zone ids (strings) at runtime, but current static inference paths classify it as token-domain/token-shape because it is treated as recursive and inferred from source leaves. This creates contract drift between compile-time diagnostics and runtime behavior.

## Assumption Reassessment (2026-03-04)

1. `evalQuery` for `tokenZones` emits zone ids, not tokens.
2. `query-kind-map` currently marks `tokenZones` as recursive, so static domain/shape inference reflects source leaf kinds rather than transformed output.
3. Current unit tests encode this mismatch and must be corrected alongside implementation.
4. Additional partition/walker typing tests also encode `tokenZones` as recursive and must be updated when contract ownership moves to explicit output semantics.
5. `tokenZones` validation currently checks only nested query validity, not source runtime-shape compatibility with token/token-id requirements.

## Architecture Check

1. A query transform must own its output contract explicitly; this is cleaner than inheriting source contracts from recursion.
2. This remains game-agnostic and applies to the generic query AST/runtime only.
3. No compatibility shim is required; we should enforce the correct contract now.
4. For long-term extensibility, static inference and query-walk partitioning should derive from one contract authority, with transforms like `tokenZones` treated as explicit-output leaves.
5. Robustness requires explicit validation that `tokenZones.source` can only produce compatible runtime shapes (`token`, `string`, or `unknown`).

## What to Change

### 1. Make tokenZones output contract explicit

1. Update query contract mapping/inference so `tokenZones` is classified with zone/string output semantics.
2. Ensure domain- and shape-inference APIs return results consistent with runtime behavior.
3. Repartition query-walk handling so `tokenZones` is no longer treated as a recursive leaf-propagation wrapper.

### 2. Add tokenZones source-shape validation

1. Add validation diagnostics when `tokenZones.source` statically resolves to incompatible known shapes (for example `number`, `object`).
2. Preserve permissive handling for unknown shape sources (runtime-resolved bindings) and compatible token/string shapes.

### 3. Update tests to reflect corrected contract

1. Replace token-domain expectations for `tokenZones` with zone-domain expectations.
2. Replace token runtime-shape expectations with string runtime-shape expectations.
3. Update query partition/walker and exhaustive type-contract expectations now that `tokenZones` is explicit-output leaf contract.
4. Add validator coverage for `tokenZones.source` shape compatibility diagnostics.

## Files to Touch

- `packages/engine/src/kernel/query-kind-map.ts` (modify)
- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` (modify)
- `packages/engine/test/unit/query-shape-inference.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (modify if needed)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- New game rules or event card content changes
- Visual runner/UI behavior

## Acceptance Criteria

### Tests That Must Pass

1. Domain inference reports `tokenZones` as zone-domain.
2. Runtime-shape inference reports `tokenZones` as string-shape.
3. Validation reports `tokenZones.source` shape mismatches for incompatible known runtime shapes.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Static query contracts and runtime query outputs must agree for every query kind.
2. Contract inference remains game-agnostic and independent of FITL-specific content.
3. `tokenZones` source validation remains shape-based and game-agnostic (no game-specific token identifiers encoded in compiler rules).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` — verifies corrected domain contract for `tokenZones`.
2. `packages/engine/test/unit/query-shape-inference.test.ts` — verifies corrected runtime shape for `tokenZones`.
3. `packages/engine/test/unit/kernel/query-walk.test.ts` — verifies walker partitioning aligns with explicit-output leaf contract semantics.
4. `packages/engine/test/unit/types-exhaustive.test.ts` — verifies recursive/leaf partition counts and contract-map coverage after repartition.
5. `packages/engine/test/unit/validate-gamedef.test.ts` — verifies `tokenZones.source` shape mismatch diagnostics and compatible-shape acceptance.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/query-domain-kinds.test.js packages/engine/dist/test/unit/query-shape-inference.test.js packages/engine/dist/test/unit/kernel/query-kind-contract.test.js packages/engine/dist/test/unit/kernel/query-walk.test.js packages/engine/dist/test/unit/types-exhaustive.test.js packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-04
- **What Changed**:
  - `tokenZones` was moved to explicit leaf contract ownership in `query-kind-map` with `domain: zone` and `runtimeShape: string`.
  - Query-walk recursion partitioning was updated so `tokenZones` dispatches as a leaf.
  - Static validation now enforces `tokenZones.source` shape compatibility and emits `DOMAIN_TOKEN_ZONES_SOURCE_SHAPE_MISMATCH` for incompatible known shapes.
  - Unit tests were updated for domain/shape/partition expectations and validator behavior.
- **Deviation From Original Plan**:
  - `query-domain-kinds.ts` and `query-shape-inference.ts` did not require direct edits; behavior aligned automatically after contract-map and walker repartition updates.
  - Added static `tokenZones.source` shape validation to strengthen robustness and prevent runtime-only failures.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - Focused unit tests passed for query domain/shape contract, partitioning, and validation.
  - Full engine suite `pnpm -F @ludoforge/engine test` passed.
  - Engine lint `pnpm -F @ludoforge/engine lint` passed.
