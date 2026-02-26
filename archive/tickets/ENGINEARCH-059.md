# ENGINEARCH-059: Add discovery-mode passthrough coverage for token and active-player selector normalization paths

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel test coverage hardening for resolver policy boundaries
**Deps**: ENGINEARCH-052

## Problem

Recent resolver-normalization refactors introduced explicit failure-policy wiring at token and active-player call sites, but discovery-mode passthrough is not currently covered for those paths. This leaves a regression gap where policy drift could silently re-wrap eval errors.

## Assumption Reassessment (2026-02-26)

1. `effects-token.ts` currently derives explicit `onResolutionFailure` via `selectorResolutionFailurePolicyForMode(evalCtx.mode)` and passes it to normalized zone resolvers in token handlers (including `moveToken`/`draw` paths covered by this ticket).
2. `effects-var.ts` (`applySetActivePlayer`) currently derives the same policy and passes it into `resolveSinglePlayerWithNormalization(...)`.
3. `packages/engine/test/unit/effects-token-move-draw.test.ts` and `packages/engine/test/unit/effects-var.test.ts` currently verify execution-mode normalization (`EFFECT_RUNTIME`) for unresolved selectors, but do not verify discovery-mode passthrough (`MISSING_BINDING`) at those same call sites.
4. Discovery-mode passthrough behavior is already asserted in other suites (`effects-reveal`, `effects-choice`, `scoped-var-runtime-access`), so this ticket is specifically about closing parity gaps for token move/draw and `setActivePlayer` call sites.
5. **Scope correction**: this ticket does not change resolver runtime behavior; it adds policy-boundary coverage to prevent accidental mode-policy regressions in future refactors.

## Architecture Check

1. Adding discovery-mode policy-boundary tests is cleaner than relying on implicit behavior and prevents future policy drift.
2. This is pure kernel test hardening and keeps GameDef/simulator architecture game-agnostic.
3. No backwards-compatibility shims or alias paths are introduced.
4. Benefit over current architecture: explicit dual-mode assertions (execution normalization + discovery passthrough) lock down intended resolver contracts at effect boundaries, which is more robust/extensible than relying on indirect coverage from unrelated effect suites.

## What to Change

### 1. Add discovery passthrough tests for token zone resolution failures

Extend token effect unit tests so unresolved zone bindings in discovery mode surface raw eval errors (`MISSING_BINDING`) for representative token call sites:
- `draw.from`
- `moveToken.from` (and/or `moveToken.to`)

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

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Updated this ticket's assumptions/scope to match current code and existing test landscape.
  - Added discovery-mode passthrough assertions (`MISSING_BINDING`) in:
    - `packages/engine/test/unit/effects-token-move-draw.test.ts` (`draw` + `moveToken` unresolved zone selectors)
    - `packages/engine/test/unit/effects-var.test.ts` (`setActivePlayer` unresolved chosen selector)
- **Deviation from original plan**:
  - Expanded token-path coverage from "at least one representative path" to both `draw` and `moveToken` selector call sites for stronger policy-boundary parity.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/effects-token-move-draw.test.js packages/engine/dist/test/unit/effects-var.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed (292/292)
  - `pnpm -F @ludoforge/engine lint` passed
