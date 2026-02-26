# ENGINEARCH-072: Harden module export-contract guards against wildcard/default export bypasses

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard helper + guard contract enforcement
**Deps**: none

## Problem

The new export-contract guard for `scoped-var-runtime-access.ts` asserts a named-export allowlist, but the shared helper only collects named exports. It does not detect `export * from ...` or default export paths, which can bypass intended API boundary checks and silently widen the public surface.

## Assumption Reassessment (2026-02-26)

1. `packages/engine/test/helpers/kernel-source-ast-guard.ts` now includes `collectTopLevelNamedExports(...)` for guard use.
2. Current helper behavior includes named exports only, and excludes explicit detection for wildcard re-export and default-export forms.
3. `packages/engine/test/unit/kernel/scoped-var-write-surface-guard.test.ts` enforces a named allowlist but does not currently assert that wildcard/default export mechanisms are forbidden.
4. **Mismatch + correction**: module export-contract guards should enforce the complete export surface (named + disallowed export mechanisms), not only named identifiers.

## Architecture Check

1. Guarding against wildcard/default export bypasses is strictly cleaner and more robust than relying on a named-only allowlist because it closes API-surface escape hatches.
2. This is kernel test-architecture hardening only; it does not introduce game-specific behavior and keeps GameDef/runtime/simulator fully game-agnostic.
3. No backwards-compatibility aliases/shims should be introduced.

## What to Change

### 1. Extend export-surface helper contracts

Update `kernel-source-ast-guard.ts` with helper(s) that capture non-named export mechanisms (for example flags for `hasExportAll`, `hasDefaultExport`, `hasExportAssignment`, or equivalent explicit metadata).

### 2. Tighten scoped-var export contract guard

Update `scoped-var-write-surface-guard.test.ts` to assert both:
- exact named allowlist, and
- explicit prohibition of wildcard/default/assignment export mechanisms for the module contract.

## Files to Touch

- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify)
- `packages/engine/test/unit/kernel/scoped-var-write-surface-guard.test.ts` (modify)

## Out of Scope

- Runtime scoped-var read/write semantics
- GameSpecDoc/GameDef schema or compiler behavior changes
- Runner or visual-config concerns

## Acceptance Criteria

### Tests That Must Pass

1. Guard fails if `scoped-var-runtime-access.ts` introduces `export * from ...`.
2. Guard fails if `scoped-var-runtime-access.ts` introduces default export/assignment forms.
3. Guard still enforces exact named-export allowlist.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel module API boundary guards cover full export surface, not only named identifiers.
2. Internal staging shapes and non-contract exports remain non-public.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/scoped-var-write-surface-guard.test.ts` — extend contract assertions to cover wildcard/default export bypass vectors.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/scoped-var-write-surface-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
