# TOKFILAST-020: Centralize Token-Filter Traversal Error Boundary Mapping and Remove Eval-Layer Coupling from Effects

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel boundary contract and effects/runtime mapping cleanup
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md

## Problem

Token-filter traversal errors are now utility-local, but boundary mapping to eval-style runtime errors is duplicated across multiple call sites. `effects-reveal.ts` currently imports `typeMismatchError` directly from eval-error, introducing avoidable cross-layer coupling and duplicated mapping logic.

## Assumption Reassessment (2026-03-06)

1. `token-filter.ts` maps `TOKEN_FILTER_TRAVERSAL_ERROR` to `TYPE_MISMATCH` at the eval-facing boundary.
2. `effects-reveal.ts` now performs the same mapping inline and imports `typeMismatchError` from `eval-error.ts`.
3. Existing active tickets (`TOKFILAST-015..019`) do not cover deduplicating this boundary mapper or removing the effect-layer import of eval error constructors.
4. Mismatch: current architecture still allows mapping drift because boundary translation logic is duplicated.

## Architecture Check

1. A single boundary mapper for token-filter traversal failures is cleaner and more robust than per-callsite duplication.
2. Centralizing mapping preserves game-agnostic kernel behavior and keeps effects/runtime layers from depending on eval internals.
3. No backwards-compatibility aliases/shims are introduced; malformed token-filter input still fails closed with deterministic runtime contracts.

## What to Change

### 1. Introduce a shared token-filter traversal boundary mapper

Create a dedicated helper that translates utility-local token-filter traversal errors into deterministic runtime error contracts (`TYPE_MISMATCH`) for boundary consumers.

### 2. Replace duplicated callsite mapping

Adopt the shared mapper in both token-filter runtime and reveal/conceal effect surfaces.

### 3. Remove direct eval-error constructor import from effects-reveal

Ensure `effects-reveal.ts` no longer imports `typeMismatchError` directly; it should depend only on the shared boundary helper.

## Files to Touch

- `packages/engine/src/kernel/<token-filter-boundary-helper>.ts` (new)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify, if context assertions need adjustment)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify, if assertions need adjustment)

## Out of Scope

- Predicate operator allow-list hardening (`archive/tickets/TOKFILAST/TOKFILAST-018-token-filter-predicate-operator-fail-closed-hardening.md`).
- Predicate node-shape and fold path strictness (`archive/tickets/TOKFILAST/TOKFILAST-019-token-filter-predicate-shape-and-fold-path-contract-hardening.md`).
- Broad error-system redesign outside token-filter traversal boundaries.

## Acceptance Criteria

### Tests That Must Pass

1. Token-filter traversal boundary mapping behavior is produced by one shared helper and remains deterministic.
2. `effects-reveal` no longer imports eval-layer error constructors directly.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Shared traversal utilities remain decoupled from eval-layer constructors.
2. Runtime/effect surfaces preserve deterministic fail-closed behavior for malformed token-filter expressions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter.test.ts` — keep deterministic boundary mapping assertions after shared-helper adoption.
2. `packages/engine/test/unit/effects-reveal.test.ts` — verify malformed token-filter failures still surface deterministic runtime errors on reveal/conceal surfaces.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
