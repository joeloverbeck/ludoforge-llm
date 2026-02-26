# ENGINEARCH-071: Add architecture guard for explicit interpreter mode threading at effect entry boundaries

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests
**Deps**: ENGINEARCH-065

## Problem

Explicit mode threading is currently enforced mainly through TypeScript contract checks and direct code review. There is no dedicated architecture guard that fails when effect entry boundaries regress to implicit mode behavior (omitting mode or reintroducing fallback semantics).

## Assumption Reassessment (2026-02-26)

1. Kernel effect entry paths currently pass explicit `mode` values in implementation.
2. Current `applyEffects(...)` call boundaries are concentrated in:
   - `src/kernel/apply-move.ts` (execution context baseline + deferred event path)
   - `src/kernel/initial-state.ts`
   - `src/kernel/phase-lifecycle.ts`
   - `src/kernel/trigger-dispatch.ts`
   - `src/kernel/event-execution.ts`
   - `src/kernel/legal-choices.ts` (discovery path)
3. Existing architecture guards cover resolver normalization and scoped runtime surfaces, but do not enforce a dedicated mode-threading contract for effect-entry boundaries.
4. **Mismatch + correction**: prior ticket scope was too generic (“known entry boundaries”) and did not enumerate the concrete boundary set or cover discovery entry protection explicitly. Guard scope should lock the current boundary map and fail on mode omission/fallback regressions.

## Architecture Check

1. Explicit guard tests are more robust than relying only on compile-time fallout because they protect architectural intent and boundary semantics.
2. Guard scope is kernel-generic and game-agnostic.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add mode-threading guard test(s)

Create/update kernel architecture guard tests to assert that effect-context construction at the protected entry boundaries includes explicit mode semantics.
Guard should verify both execution and discovery boundary semantics for the listed modules above.

### 2. Guard against fallback reintroduction

Add assertions that helper/fallback patterns such as `ctx.mode ?? 'execution'` are not reintroduced in kernel mode plumbing.

### 3. Keep guard maintainable

Use targeted AST/source checks with clear failure messages that identify violating module and boundary.
Include an explicit boundary allowlist in the test so newly introduced `applyEffects` entry modules require intentional guard updates.

## Files to Touch

- `packages/engine/test/unit/kernel/` (add/modify guard test files)
- Optional minimal updates to guard helper utilities in `packages/engine/test/helpers/` if needed for AST-based checks

## Out of Scope

- Behavioral changes to mode policies
- New interpreter modes

## Acceptance Criteria

### Tests That Must Pass

1. Guard test fails when an effect entry context omits explicit mode.
2. Guard test fails if implicit execution fallback patterns are reintroduced.
3. Guard test fails if new kernel `applyEffects` boundary modules are introduced without updating the protected boundary allowlist.
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

### Invariants

1. Interpreter mode is explicit at all protected effect entry boundaries.
2. Discovery vs execution mode intent remains explicit at boundary construction points.
3. Architectural anti-drift protection exists beyond type-only enforcement.

## Test Plan

### New/Modified Tests

1. New/updated kernel guard test(s) validating mode threading and fallback prohibition.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Reassessed and corrected ticket assumptions/scope to enumerate the concrete `applyEffects` boundary module set and include discovery-path protection.
  - Added `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` to enforce:
    - boundary allowlist drift detection for kernel `applyEffects` entry modules,
    - explicit mode threading at each guarded boundary,
    - prohibition of implicit `mode ?? 'execution'` fallback semantics in kernel mode plumbing.
  - Extracted shared AST context-provenance helpers into `packages/engine/test/helpers/kernel-source-ast-guard.ts` and switched the mode-threading guard to consume them.
  - Added `packages/engine/test/unit/kernel-source-ast-guard.test.ts` to lock helper behavior for identifier-bound contexts and spread-chain property resolution.
- Deviations from original plan:
  - Guard implementation used AST-based context-resolution checks that support both inline object-literal contexts and identifier-bound object-literal contexts (needed for `legal-choices.ts`), which is stricter and more robust than regex-only checks.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (296/296).
  - `pnpm -F @ludoforge/engine lint` passed.
