# ENGINEARCH-064: Harden selector-policy architecture guards with semantic checks

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard robustness
**Deps**: none

## Problem

The selector-policy architecture guard currently relies on fragile source-string checks. This can fail on harmless formatting changes and can miss semantic drift (for example dead or disconnected canonical derivation declarations). The decoupling invariant (`selector-resolution-normalization.ts` must not depend on `effect-context.ts`) is also not directly guarded.

## Assumption Reassessment (2026-02-26)

1. `effect-resolver-normalization-guard.test.ts` already enforces normalized resolver helper routing and blocks direct `resolvePlayerSel` / `resolveZoneRef` usage in effect modules.
2. Canonical `onResolutionFailure` derivation enforcement currently depends on exact string matching for declaration shape/content.
3. No direct architecture test currently asserts selector-normalization remains decoupled from `effect-context.ts`.
4. **Mismatch + correction**: guard coverage exists but is syntactic and brittle; scope should add semantic anti-drift checks and an explicit decoupling assertion.

## Architecture Check

1. Semantic guard checks are more robust and extensible than exact string matching because they encode architectural intent instead of formatting details.
2. Explicitly guarding helper-layer decoupling preserves a clean game-agnostic kernel boundary between shared normalization helpers and effect plumbing.
3. This work is test/guard hardening only; no game-specific logic enters GameDef/runtime/kernel, and no backwards-compatibility aliases are introduced.

## What to Change

### 1. Replace brittle canonical-policy string checks with semantic checks

Refactor guard assertions to validate that normalized resolver helper callsites pass `onResolutionFailure` through a canonical derived identifier, rather than enforcing one exact declaration line string.

### 2. Add explicit decoupling guard for selector-normalization helper

Add a guard assertion that `src/kernel/selector-resolution-normalization.ts` does not import from `src/kernel/effect-context.ts`.

### 3. Keep module coverage synchronized

Preserve/extend the existing effect-module policy list sync assertion so new effect modules cannot silently evade the architecture guard.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` (modify)
- `packages/engine/test/helpers/` guard helpers (modify/add only if semantic helper extraction improves clarity)
- `packages/engine/test/unit/selector-resolution-normalization.test.ts` (modify only if decoupling assertion fits better there)

## Out of Scope

- Runtime behavior changes in effect handlers
- Resolver algorithm changes (`resolvePlayerSel`, `resolveZoneRef`)
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Guard fails when normalized resolver helper callsites use ad-hoc policy literals/expressions instead of canonical derivation flow.
2. Guard fails if `selector-resolution-normalization.ts` imports from `effect-context.ts`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Selector policy derivation remains centrally governed and resistant to callsite drift.
2. Shared selector-normalization helpers remain decoupled from effect-context plumbing.
3. Kernel runtime/contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` — replace brittle syntax checks with semantic anti-drift assertions and add explicit decoupling assertion.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-resolver-normalization-guard.test.js packages/engine/dist/test/unit/selector-resolution-normalization.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
