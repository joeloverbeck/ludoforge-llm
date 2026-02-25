# ENGINEARCH-035: Restore exhaustive valid-scope coverage for setVar/addVar schema tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit-test contract coverage hardening
**Deps**: none

## Problem

Recent matrix-driven schema tests improved drift resistance for invalid endpoint shapes, but reduced explicit positive coverage for `setVar`/`addVar` valid scope payloads (`global`, `pvar`, `zoneVar`). This creates a test blind spot where valid-branch regressions could slip through while invalid-shape checks still pass.

## Assumption Reassessment (2026-02-25)

1. `packages/engine/test/unit/schemas-ast.test.ts` now derives `setVar`/`addVar` tests from `buildDiscriminatedEndpointMatrix`.
2. The helper produces a single valid control case plus invalid permutations, which is sufficient for transfer endpoint shape drift checks but not exhaustive positive branch coverage for single-endpoint payloads.
3. **Mismatch + correction**: current ticket coverage claims imply complete scope matrix parity; explicit positive checks for all three valid `setVar`/`addVar` scopes must be restored.

## Architecture Check

1. Exhaustive positive + negative contract tests are cleaner and more robust than relying on one valid control case.
2. This remains game-agnostic kernel contract work; no `GameSpecDoc`/game-specific logic is introduced.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Reinstate explicit valid payload assertions per scope

Add explicit positive assertions for `setVar` and `addVar` across all valid scopes:
- `global`
- `pvar`
- `zoneVar`

### 2. Keep matrix-driven invalid checks

Retain matrix-based invalid/forbidden field checks to preserve anti-drift breadth.

## Files to Touch

- `packages/engine/test/unit/schemas-ast.test.ts` (modify)

## Out of Scope

- Engine runtime/schema implementation changes
- Trace schema contract changes

## Acceptance Criteria

### Tests That Must Pass

1. `setVar` schema test explicitly validates all three valid scoped payloads.
2. `addVar` schema test explicitly validates all three valid scoped payloads.
3. Existing suite: `pnpm -F @ludoforge/engine test -- test/unit/schemas-ast.test.ts`

### Invariants

1. Scope-contract tests verify both forbidden-field rejection and valid-branch acceptance.
2. Coverage is contract-centric and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — add explicit valid `global`/`pvar`/`zoneVar` cases for `setVar`.
2. `packages/engine/test/unit/schemas-ast.test.ts` — add explicit valid `global`/`pvar`/`zoneVar` cases for `addVar`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/schemas-ast.test.ts`
3. `pnpm -F @ludoforge/engine test`
