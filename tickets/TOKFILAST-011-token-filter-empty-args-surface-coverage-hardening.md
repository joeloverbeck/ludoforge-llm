# TOKFILAST-011: Harden Empty-Args Token Filter Coverage Across All Filter Surfaces

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test and diagnostics coverage hardening
**Deps**: archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md, tickets/TOKFILAST-006-diagnostic-path-assertion-hardening.md

## Problem

Empty-args token-filter rejection was added, but test coverage currently verifies only a subset of filter-bearing surfaces. Missing surface-specific assertions increase risk of silent regression in diagnostic path fidelity or skipped validation routes.

## Assumption Reassessment (2026-03-06)

1. Current tests assert empty-args rejection for `tokensInZone` domain and `reveal.filter` effect (`packages/engine/test/unit/validate-gamedef.test.ts`).
2. Other surfaces that accept token filters include `conceal.filter`, `tokensInMapSpaces.filter`, and `tokensInAdjacentZones.filter`.
3. Mismatch: we do not yet assert empty-args diagnostics on every supported token-filter surface/path.

## Architecture Check

1. Table-driven cross-surface tests provide stronger contract coverage than ad-hoc single-surface assertions.
2. This is validation/test hardening only; no game-specific branching is introduced into engine runtime.
3. No compatibility shim behavior is introduced.

## What to Change

### 1. Add cross-surface empty-args diagnostics tests

Cover all token-filter-bearing query/effect surfaces and assert deterministic `code + path` diagnostics.

### 2. Add runtime-path sanity assertions for non-validated calls

Where runtime APIs can be called directly in tests/helpers, assert zero-arity failures stay deterministic across surfaces.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify, if additional query surfaces are directly exercised)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify, if effect runtime surface assertions are needed)

## Out of Scope

- New token-filter traversal abstractions (`TOKFILAST-004`).
- Token-filter AST normalization in lowering (`TOKFILAST-007`).
- Static GameSpecDoc scanning for legacy arrays (`TOKFILAST-008`).

## Acceptance Criteria

### Tests That Must Pass

1. Empty-args token-filter diagnostics are asserted for all supported query/effect filter surfaces.
2. Diagnostic paths remain deterministic and surface-specific.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Token-filter arity invariant enforcement is consistently covered across all filter-bearing entry points.
2. Validation behavior remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add table-driven empty-args cases for all filter surfaces.
2. `packages/engine/test/unit/eval-query.test.ts` — extend direct runtime query assertions where relevant.
3. `packages/engine/test/unit/effects-reveal.test.ts` — add runtime effect-path checks if needed for uncovered surfaces.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
