# TOKFILAST-040: Guard CNL Predicate Canonical Shape Policy Against Mixed-Form Regression

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint/policy guardrail coverage
**Deps**: tickets/TOKFILAST-039-cnl-predicate-canonical-shape-strict-alias-key-rejection.md

## Problem

Even with behavior tests, there is no dedicated policy guard that prevents future reintroduction of mixed-form predicate acceptance patterns (`source.op` + ignored alias keys) in CNL lowering paths.

## Assumption Reassessment (2026-03-06)

1. CNL predicate lowering is the only authoring boundary where token-filter/asset-row predicate shape is normalized.
2. Existing policy coverage does not explicitly guard canonical predicate object key policy in CNL lowering modules.
3. Without a guardrail, permissive mixed-shape acceptance can reappear via local edits that still pass broad compilation tests.

## Architecture Check

1. Explicit policy guards for canonical-shape contracts reduce drift and reviewer-memory dependence.
2. This preserves game-agnostic boundaries: it constrains compiler contract hygiene, not game-specific behavior.
3. No aliases/shims are introduced; this hardens no-backwards-compatibility enforcement.

## What to Change

### 1. Add policy test for canonical predicate shape enforcement in CNL

Add a lint/policy test that inspects `compile-conditions.ts` and fails if token-filter/asset-row predicate lowering reintroduces alias fallback reads (`source.eq`, `source.neq`, `source.in`, `source.notIn`).

### 2. Lock canonical import/contract usage in CNL predicate lowering

Assert CNL predicate lowering consumes shared contract symbols (`isPredicateOp`, `PREDICATE_OPERATORS`) from `../contracts/index.js`.

## Files to Touch

- `packages/engine/test/unit/lint/cnl-predicate-shape-policy.test.ts` (new)
- `packages/engine/test/helpers/lint-policy-helpers.ts` (modify, if helper utilities are needed)

## Out of Scope

- Runtime validator traversal-mode work (`tickets/TOKFILAST-038-token-filter-dual-traversal-modes-and-boundary-mapper-unification.md`).
- Predicate runtime semantics or diagnostic code taxonomy changes.

## Acceptance Criteria

### Tests That Must Pass

1. Policy fails when CNL predicate lowering reads alias keys for token-filter or `assetRows.where` parsing.
2. Policy fails when CNL predicate lowering stops using shared predicate-op contract imports.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Canonical predicate shape contract remains centralized and fail-closed in CNL.
2. `GameDef` runtime/simulator remains game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/cnl-predicate-shape-policy.test.ts` — guard no-alias parsing and shared contract import provenance in CNL predicate lowering.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
