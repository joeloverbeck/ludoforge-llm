# SEATRES-066: Generalize effect-runtime reason literal guard to kernel-wide invariant

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel source-guard policy coverage for canonical effect runtime reason usage
**Deps**: archive/tickets/SEATRES/SEATRES-054-complete-effect-runtime-reason-context-contracts-and-guarded-consumption.md

## Problem

Current guard coverage for canonical `EFFECT_RUNTIME_REASONS.*` usage is limited to a hardcoded list of emitter files. This allows newly added emitter/normalization files to regress to raw reason string literals without failing tests.

## Assumption Reassessment (2026-03-03)

1. `packages/engine/test/unit/effect-error-contracts.test.ts` currently enforces literal-free reason calls only for a fixed `emitterFiles` array.
2. The fixed list omits active effect-runtime emitters/routers that already call `effectRuntimeError(...)`, including:
   - `packages/engine/src/kernel/scoped-var-runtime-access.ts`
   - `packages/engine/src/kernel/selector-resolution-normalization.ts`
   - `packages/engine/src/kernel/effect-context-invariants.ts`
3. `selector-resolution-normalization.ts` and `scoped-var-runtime-access.ts` intentionally route `code` as `EffectRuntimeReason`-typed options; they are part of the same invariant surface and should be guarded.
4. No active ticket currently establishes this kernel-wide invariant (SEATRES-067 narrows scoped-var code-domain typing but does not add global literal-guard coverage).

## Architecture Check

1. A kernel-wide invariant guard is cleaner than per-file manual curation and prevents silent contract drift as modules evolve.
2. This is contract-hardening in agnostic engine code and does not introduce game-specific branching into `GameDef`/runtime/simulator.
3. The clean boundary is: guard effect-runtime reason surfaces only (`effectRuntimeError(reason, ...)` and `EffectRuntimeReason`-typed `code` routing), not every kernel object property named `code`.
4. No compatibility aliasing/shims: the guard enforces canonical constants directly.

## What to Change

### 1. Replace hardcoded guard scope with discoverable effect-runtime scope

1. Update source-guard logic to discover kernel files that participate in effect-runtime reason emission/routing.
2. At minimum include:
   - `effects-*.ts` emitters
   - `effect-dispatch.ts`
   - `effect-context-invariants.ts`
   - `scoped-var-runtime-access.ts`
   - `selector-resolution-normalization.ts`
3. Exclude reason-definition/type files (for example `runtime-reasons.ts`) from literal checks.

### 2. Enforce literal-free reason usage across effect-runtime surfaces

1. Guard `effectRuntimeError(...)` call arguments against raw string reason literals.
2. Guard typed normalization/routing `code` handoff sites (selector/scoped-var paths) against raw reason literals where the field type is `EffectRuntimeReason`.

### 3. Keep guard deterministic and review-friendly

1. Prefer AST/source-structure checks with clear failure messages naming offending file and pattern.
2. Keep exception list explicit and minimal.

## Files to Touch

- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-guard.ts` (modify, if helper expansion is needed)

## Out of Scope

- Redesigning runtime reason taxonomy
- Changing runtime error message text
- GameSpecDoc/visual-config schema changes
- Guarding unrelated kernel diagnostic `code` literals that are not `EffectRuntimeReason` surfaces

## Acceptance Criteria

### Tests That Must Pass

1. Introducing a raw reason string literal in any kernel emitter/normalization file fails the guard test.
2. Canonical `EFFECT_RUNTIME_REASONS.*` usage passes guard tests without requiring manual file-list updates.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel effect-runtime reason usage is constant-based and centrally governed.
2. Guard policy remains game-agnostic and independent of any specific game data model.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — replace hardcoded emitter list with kernel-wide invariant checks and explicit exclusions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Replaced hardcoded emitter file-list guarding in `effect-error-contracts.test.ts` with discoverable kernel-module coverage.
  - Added kernel-wide literal guard for `effectRuntimeError(...)` reason arguments across discovered kernel emitters.
  - Added guard for selector-normalization `code` option surfaces to block raw string reason literals in normalization call sites.
  - Updated this ticket’s assumptions/scope to reflect actual risk surfaces and avoid overreaching to unrelated `code` fields.
- **Deviations From Original Plan**:
  - No helper-file expansion was required; existing `listKernelModulesByPrefix('')` support was sufficient for discoverable coverage.
  - Guard scope is intentionally effect-runtime specific (emitters + normalization routes), not all kernel `code` properties.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
