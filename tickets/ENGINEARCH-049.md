# ENGINEARCH-049: Centralize numeric scoped-var runtime reads into shared access primitives

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - kernel shared runtime access helper + effect refactor
**Deps**: none

## Problem

After endpoint-resolution unification, numeric scoped-var read logic is still duplicated in effect modules (`readScopedIntForAddVar` and `readScopedIntValue`). This leaves another semantic-drift seam in runtime validation and diagnostics.

## Assumption Reassessment (2026-02-26)

1. `readScopedVarValue` is shared and canonical for generic scoped reads.
2. Effect modules still implement local int-only wrappers and custom fallback diagnostics.
3. Tests currently validate behavior parity, but there is no single int-read primitive contract in shared access.
4. **Mismatch + correction**: int-only scoped reads should be first-class shared primitives, not per-effect wrappers.

## Architecture Check

1. A single shared int-read primitive is cleaner and more robust than parallel wrappers, reducing drift in validation/error semantics.
2. This is game-agnostic kernel infrastructure; no game-specific branching is introduced.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Add shared int-read primitive

Add helper(s) in `scoped-var-runtime-access.ts` for int-only scoped reads that:
- leverage canonical scoped state access
- enforce numeric runtime values
- preserve effect/error-code diagnostics shape

### 2. Refactor var/resource handlers

Replace local int-read wrapper functions in `effects-var.ts` and `effects-resource.ts` with shared helper usage.

### 3. Lock helper contract with tests

Add direct unit coverage for shared int-read behavior across global/pvar/zone scopes and error paths.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)

## Out of Scope

- Endpoint resolution API redesign
- New effect types or gameplay semantics
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Int-only scoped reads are resolved through shared runtime access primitives.
2. `addVar`/`transferVar` behavior and diagnostics remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. One canonical implementation path exists for scoped int reads.
2. Kernel/runtime contracts remain game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` - direct coverage for shared scoped int-read semantics and diagnostics.
2. `packages/engine/test/unit/effects-var.test.ts` - parity guard for `addVar` int-read behavior.
3. `packages/engine/test/unit/transfer-var.test.ts` - parity guard for `transferVar` int-read behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
