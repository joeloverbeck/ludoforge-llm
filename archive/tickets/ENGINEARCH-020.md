# ENGINEARCH-020: Enforce Exact, Mutually Exclusive Selector-Cardinality Context Contracts

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel eval-error type contracts + compile-time type tests
**Deps**: None

## Problem

`SELECTOR_CARDINALITY` now has a discriminator, but branch payload exclusivity is not fully enforced when contexts are widened/non-literal. Branch shapes still intersect with `EvalErrorContext` (`Readonly<Record<string, unknown>>`), which allows extra keys and can let mixed player+zone payload objects slip through assignability paths that bypass literal excess-property checks.

## Assumption Reassessment (2026-02-25)

1. `TypedSelectorCardinalityEvalErrorContext` currently uses `selectorKind` discrimination in `packages/engine/src/kernel/eval-error.ts`.
2. Selector-cardinality branch types currently intersect with `EvalErrorContext` (index-signature map), weakening exactness and mutual-exclusivity guarantees in widened object flows.
3. `packages/engine/test/unit/types-foundation.test.ts` already rejects multiple invalid **literal** selector-cardinality shapes, including mixed branch fields.
4. Current tests do **not** yet guarantee rejection of mixed branch fields for widened/non-literal selector-cardinality contexts.

## Architecture Check

1. Exact and mutually exclusive branch contracts are architecturally stronger than permissive map intersections because invalid mixed payloads fail at compile time in realistic call flows, not only object literals.
2. This is pure kernel typing hardening and preserves engine agnosticism (no GameSpecDoc/game-specific logic coupling).
3. No backwards-compatibility aliases/shims are introduced; invalid payload shapes become direct type errors.

## What to Change

### 1. Remove permissive map intersection from selector-cardinality branches

Refactor selector-cardinality branch types so they do not inherit the broad `Readonly<Record<string, unknown>>` index signature.

### 2. Make branch payloads structurally exclusive

Add explicit `never`-typed exclusions (or equivalent exactness strategy) so player branch cannot include zone-only keys and zone branch cannot include player-only keys, including widened-object assignments.

### 3. Keep non-selector error contexts unchanged

Do not broaden this into a global eval-error context redesign; scope is selector-cardinality type contract hardening only.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)

## Out of Scope

- Selector runtime semantics changes
- Defer taxonomy policy changes (`EVAL_ERROR_DEFER_CLASSES_BY_CODE` behavior)
- GameSpecDoc / visual-config format changes

## Acceptance Criteria

### Tests That Must Pass

1. Mixed player+zone selector-cardinality payloads are compile-time failures for literal and widened contexts.
2. Valid player and zone branch payloads still type-check.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `SELECTOR_CARDINALITY` context is compile-time unambiguous and branch-exclusive.
2. GameDef/simulator/runtime remain game-agnostic and free from game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — add compile-time cases that reject widened mixed-branch selector-cardinality payloads.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/types-foundation.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Removed `EvalErrorContext` index-signature intersection from selector-cardinality branch contracts in `packages/engine/src/kernel/eval-error.ts`.
  - Added explicit `never` exclusions for cross-branch fields (`resolvedPlayers` vs `resolvedZones`, plus `playerCount`/`resolvedCount` shape exclusivity) to enforce mutual exclusivity in widened flows.
  - Added reusable `ExactEvalErrorContext<C, T>` type utility and applied it to typed non-union eval-error helper APIs to reject undeclared keys in widened contexts.
  - Removed `EvalErrorContext` index-signature intersections from other typed eval-error context contracts (`QUERY_BOUNDS_EXCEEDED`, `DIVISION_BY_ZERO`, `ZONE_PROP_NOT_FOUND`) to keep structured contexts explicit.
  - Expanded `packages/engine/test/unit/types-foundation.test.ts` with widened-object compile-time rejection cases for mixed player+zone payloads.
  - Expanded `packages/engine/test/unit/types-foundation.test.ts` with literal and widened compile-time rejection cases for undeclared keys on query-bounds, division-by-zero, and zone-prop typed contexts.
  - Adjusted existing literal compile-time assertions to attach `@ts-expect-error` at property level where stricter contracts now fail earlier.
- Deviations from original plan:
  - Scope expanded in a controlled way to harden exactness for other typed non-union eval-error contexts using a shared utility.
  - Added `pnpm -F @ludoforge/engine lint` verification in addition to planned test/type commands.
- Verification results:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/types-foundation.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
