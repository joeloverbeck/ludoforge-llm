# TOKFILAST-011: Harden Empty-Args Token Filter Coverage Across All Filter Surfaces

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test and diagnostics coverage hardening
**Deps**: archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md, archive/tickets/TOKFILAST/TOKFILAST-006-diagnostic-path-assertion-hardening.md

## Problem

Empty-args token-filter rejection was added, but test coverage currently verifies only a subset of filter-bearing surfaces. Missing surface-specific assertions increase risk of silent regression in diagnostic path fidelity or skipped validation routes.

## Assumption Reassessment (2026-03-06)

1. Current validator tests assert empty-args rejection for only two surfaces: `tokensInZone.filter` and `reveal.filter` (`packages/engine/test/unit/validate-gamedef.test.ts`).
2. Additional supported token-filter surfaces in validator/runtime are `tokensInMapSpaces.filter`, `tokensInAdjacentZones.filter`, and `conceal.filter` (`packages/engine/src/kernel/validate-gamedef-behavior.ts`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/effects-reveal.ts`).
3. Existing schema parsing tests already reject empty boolean args at AST-schema level (`packages/engine/test/unit/schemas-ast.test.ts`), so the remaining gap is behavior-level coverage (validator diagnostics + direct runtime entry points).
4. Runtime tests currently assert zero-arity rejection only for `tokensInZone` (`packages/engine/test/unit/eval-query.test.ts`); equivalent direct-runtime assertions for `tokensInMapSpaces`, `tokensInAdjacentZones`, `reveal.filter`, and `conceal.filter` are missing.

## Architecture Check

1. Table-driven cross-surface tests are preferred over ad-hoc one-off assertions because they enforce a single invariant across all supported filter-bearing surfaces.
2. This work should stay contract-level and test-only unless a failing test exposes a real runtime/validator divergence.
3. No compatibility aliases or dual-path behavior should be introduced; if a surface diverges, tests should force a single canonical behavior.

## What to Change

### 1. Add cross-surface empty-args diagnostics tests

Cover all token-filter-bearing validator surfaces and assert deterministic `code + path` diagnostics:
- `actions[*].params[*].domain` for `tokensInZone`, `tokensInMapSpaces`, `tokensInAdjacentZones`
- `actions[*].effects[*].reveal.filter`
- `actions[*].effects[*].conceal.filter`

### 2. Add runtime-path sanity assertions for non-validated calls

Where runtime APIs are invoked directly in unit tests, assert zero-arity failures stay deterministic across surfaces:
- `evalQuery` for `tokensInMapSpaces` and `tokensInAdjacentZones` (alongside existing `tokensInZone`)
- `applyEffect` for `reveal.filter` and `conceal.filter`

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/src/kernel/hidden-info-grants.ts` (modify)

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
2. `packages/engine/test/unit/eval-query.test.ts` — add direct runtime zero-arity assertions for `tokensInMapSpaces` and `tokensInAdjacentZones`.
3. `packages/engine/test/unit/effects-reveal.test.ts` — add direct runtime zero-arity assertions for `reveal.filter` and `conceal.filter`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Implemented as planned: table-driven validator coverage now asserts empty-args diagnostics across `tokensInZone`, `tokensInMapSpaces`, `tokensInAdjacentZones`, `reveal.filter`, and `conceal.filter`.
- Implemented as planned: runtime query coverage now asserts deterministic zero-arity rejection for `tokensInZone`, `tokensInMapSpaces`, and `tokensInAdjacentZones`.
- Expanded beyond original plan due test-exposed runtime inconsistency: reveal/conceal runtime now validates token-filter boolean arity eagerly, so failure does not depend on branch state (for example dedupe path or existing grants).
- Hardened canonical filter normalization failure mode: empty boolean args now throw `TYPE_MISMATCH` consistently during hidden-info filter canonicalization.
- Verification: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test:unit`, and `pnpm -F @ludoforge/engine lint` all passed.
