# ENGINEARCH-059: Add discovery-mode passthrough coverage for token and active-player selector normalization paths

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel test coverage hardening for resolver policy boundaries
**Deps**: ENGINEARCH-052

## Problem

Recent resolver-normalization refactors introduced explicit failure-policy wiring at token and active-player call sites, but discovery-mode passthrough is not currently covered for those paths. This leaves a regression gap where policy drift could silently re-wrap eval errors.

## Assumption Reassessment (2026-02-26)

1. `effects-token.ts` now derives and passes explicit `onResolutionFailure` policy into normalized zone resolution helpers.
2. `effects-var.ts` (`setActivePlayer`) now derives and passes explicit `onResolutionFailure` policy into normalized player resolution helpers.
3. Existing unit tests currently assert execution-mode normalization for these paths, but do not assert discovery-mode passthrough for the same call sites.
4. **Mismatch + correction**: policy behavior should be asserted in both execution and discovery modes at all updated call sites, not only reveal/choice/scoped-var tests.

## Architecture Check

1. Adding discovery-mode policy-boundary tests is cleaner than relying on implicit behavior and prevents future policy drift.
2. This is pure kernel test hardening and keeps GameDef/simulator architecture game-agnostic.
3. No backwards-compatibility shims or alias paths are introduced.

## What to Change

### 1. Add discovery passthrough tests for token zone resolution failures

Extend token effect unit tests so unresolved zone bindings in discovery mode surface raw eval errors (`MISSING_BINDING`) for at least one representative token path.

### 2. Add discovery passthrough test for setActivePlayer selector failures

Extend variable effect unit tests so unresolved chosen player selector in discovery mode surfaces raw eval errors (`MISSING_BINDING`).

## Files to Touch

- `packages/engine/test/unit/effects-token-move-draw.test.ts` (modify)
- `packages/engine/test/unit/effects-var.test.ts` (modify)

## Out of Scope

- Runtime behavior changes in effect handlers
- Selector resolver implementation changes
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Token selector-resolution discovery-mode failures are asserted as passthrough eval errors.
2. `setActivePlayer` selector-resolution discovery-mode failures are asserted as passthrough eval errors.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Resolver normalization policy remains explicit and deterministic per call site.
2. Kernel/runtime remains game-agnostic with no game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-token-move-draw.test.ts` — discovery-mode passthrough regression guard for token selector failures.
2. `packages/engine/test/unit/effects-var.test.ts` — discovery-mode passthrough regression guard for `setActivePlayer` selector failures.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-token-move-draw.test.js packages/engine/dist/test/unit/effects-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
