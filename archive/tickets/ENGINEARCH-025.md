# ENGINEARCH-025: Add Direct Contract Tests for Selector-Cardinality Context Builders

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — eval-error helper contract tests (runtime + compile-time)
**Deps**: ENGINEARCH-021

## Problem

Selector-cardinality context builders now centralize payload construction, but there is no direct test coverage on those helpers. Current tests validate behavior through `resolve-selectors` throw paths and `selectorCardinalityError` call-site typing, so helper-specific contract regressions could slip in with weaker localization.

## Assumption Reassessment (2026-02-25)

1. `selectorCardinalityPlayerCountContext`, `selectorCardinalityPlayerResolvedContext`, and `selectorCardinalityZoneResolvedContext` are defined in `packages/engine/src/kernel/eval-error.ts` and exported through the kernel barrel.
2. `packages/engine/test/unit/resolve-selectors.test.ts` already covers downstream emitted context shape, including the zero-player `playerCount` branch and unresolved-binding zone defer metadata.
3. `packages/engine/test/unit/types-foundation.test.ts` already covers mixed player/zone context rejection and defer-class literal checks for `selectorCardinalityError`, but does not directly type-check helper signatures.
4. `packages/engine/test/unit/eval-error.test.ts` currently does not assert direct runtime output shape for the three selector-cardinality helper builders.

## Architecture Reassessment

1. Adding direct helper-level tests is more robust than relying only on indirect resolver assertions, because it localizes failures to the canonical contract boundary.
2. This preserves the current clean architecture introduced by ENGINEARCH-021: one canonical constructor surface, no aliasing, no fallback branches.
3. No runtime architecture change is needed now; the architecture already improved. This ticket should harden it with direct regression tests rather than add new abstractions.

## Updated Scope

### In Scope

1. Add direct runtime shape checks for each selector-cardinality context helper.
2. Add direct compile-time checks for helper misuse (invalid selector kinds/payload mixing and invalid defer-class literals at helper call boundaries).
3. Keep existing `selectorCardinalityError` compile-time tests intact while adding focused helper-signature assertions.

### Out of Scope

1. Selector resolution runtime logic changes.
2. New eval-error codes or defer classes.
3. GameSpecDoc or visual-config schema changes.

## Files to Touch

- `packages/engine/test/unit/eval-error.test.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)

## Acceptance Criteria

### Tests That Must Pass

1. Each selector-cardinality helper has direct unit assertions for expected context shape.
2. Compile-time tests prevent helper misuse at helper call boundaries (not only at `selectorCardinalityError` call sites).
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Selector-cardinality context construction remains centralized and contract-driven.
2. `GameDef`/simulation remain fully game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error.test.ts` — add direct runtime contract tests for selector-cardinality context builders.
2. `packages/engine/test/unit/types-foundation.test.ts` — add compile-time misuse checks for helper call signatures and defer metadata literals.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-error.test.js`
4. `pnpm -F @ludoforge/engine test:unit`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Updated ticket assumptions/scope to match the current codebase: resolver-path and `selectorCardinalityError` contract coverage already existed, while helper-specific contract coverage was the true gap.
  - Added direct runtime contract assertions for selector-cardinality helper builders in `packages/engine/test/unit/eval-error.test.ts`.
  - Added direct compile-time helper-signature misuse checks in `packages/engine/test/unit/types-foundation.test.ts`, including selector type mismatches, payload-id type mismatches, and invalid defer-class literals.
- **Deviation from original plan**:
  - No architecture/runtime code changes were needed; the existing helper-based architecture from ENGINEARCH-021 was retained and hardened by tests.
- **Verification results**:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-error.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
