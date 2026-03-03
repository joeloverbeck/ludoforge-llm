# SEATRES-074: Generalize redundant effect-runtime conjunction guard kernel-wide

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel-wide source-contract enforcement for effect-runtime reason guard usage
**Deps**: archive/tickets/SEATRES/SEATRES-066-generalize-effect-runtime-reason-literal-guard-to-kernel-wide-invariant.md, archive/tickets/SEATRES/SEATRES-068-remove-redundant-effect-runtime-code-check-at-reason-guards.md, archive/tickets/SEATRES/SEATRES-073-require-shared-error-symbol-in-redundant-effect-runtime-conjunction-guard.md

## Problem

Current coverage enforces redundant-effect-runtime conjunction absence only in two targeted files. The architectural invariant should be kernel-wide for modules that consume `isEffectRuntimeReason(...)`, otherwise duplication can re-enter elsewhere.

## Assumption Reassessment (2026-03-03)

1. `effect-error-contracts.test.ts` currently checks only `apply-move.ts` and `legal-choices.ts` for this anti-pattern.
2. Helper infrastructure exists to discover kernel modules and parse source contracts.
3. No active ticket in `tickets/*` currently scopes kernel-wide enforcement of this specific redundant conjunction invariant.

## Architecture Check

1. Kernel-wide policy checks are cleaner than per-file ad hoc assertions because they encode architecture as a reusable invariant.
2. This remains engine-agnostic guard policy; it does not encode any game-specific behavior and preserves GameSpecDoc/visual-config separation.
3. No backwards-compatibility aliasing: enforce the canonical single-guard policy directly.

## What to Change

### 1. Extend source-contract policy scope

1. Discover kernel modules that consume `isEffectRuntimeReason(...)`.
2. For those modules, assert absence of redundant `isEffectErrorCode(..., 'EFFECT_RUNTIME') && isEffectRuntimeReason(...)` conjunctions using AST detection.
3. Keep existing targeted assertions only where they add additional value (for example reason-specific presence checks).

### 2. Add clear diagnostic messaging for violations

1. Emit failure messages with module path and violation summary.
2. Ensure messages guide direct migration to canonical single-guard usage.

## Files to Touch

- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-guard.ts` (modify only if helper expansion is needed)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify only if helper expansion is needed)

## Out of Scope

- Runtime behavior changes unrelated to source guard policy
- Error taxonomy/reason-id changes
- GameSpecDoc or visual-config schema/content changes

## Acceptance Criteria

### Tests That Must Pass

1. Kernel modules that consume `isEffectRuntimeReason(...)` are guarded against redundant `EFFECT_RUNTIME` pre-check conjunctions.
2. Existing targeted reason-consumer expectations remain valid.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Canonical runtime reason guard policy is enforced consistently across kernel source guard scope.
2. Policy remains game-agnostic and independent of game-specific GameSpecDoc/visual-config data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — expand from targeted-file checks to kernel-wide anti-pattern scan for reason-consumer modules. Rationale: prevent policy drift.
2. `packages/engine/test/unit/kernel-source-ast-guard.test.ts` — add/adjust fixtures if helper behavior is extended for kernel-wide scanning. Rationale: preserve helper correctness under broader usage.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/kernel-source-ast-guard.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`
