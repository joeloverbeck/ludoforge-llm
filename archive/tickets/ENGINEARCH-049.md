# ENGINEARCH-049: Centralize numeric scoped-var runtime reads into shared access primitives

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - kernel shared runtime access helper + effect refactor
**Deps**: none

## Problem

After endpoint-resolution unification, numeric scoped-var read logic is still duplicated in effect modules (`readScopedIntForAddVar` and `readScopedIntValue`). This leaves another semantic-drift seam in runtime validation and diagnostics.

## Assumption Reassessment (2026-02-26)

1. `readScopedVarValue` is shared and canonical for generic scoped reads.
2. Effect modules still implement local int-only wrappers and custom fallback diagnostics.
3. Existing unit tests already cover most `addVar`/`transferVar` behavior, but they do not establish a single shared int-read primitive contract.
4. Existing unit tests do not explicitly lock behavior for corrupted runtime state where an int-targeted global/pvar cell holds a boolean.
5. **Mismatch + correction**: int-only scoped reads should be first-class shared primitives, not per-effect wrappers.

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

Add direct unit coverage for shared int-read behavior across global/pvar/zone scopes and error paths, including corrupted-runtime boolean payloads on int-targeted global/pvar cells.

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

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` - direct coverage for shared scoped int-read semantics, diagnostics, and corrupted-runtime boolean edge cases.
2. `packages/engine/test/unit/effects-var.test.ts` - `addVar` parity guard when int-targeted runtime state is corrupted.
3. `packages/engine/test/unit/transfer-var.test.ts` - `transferVar` parity guard when int-targeted runtime state is corrupted.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Added shared `readScopedIntVarValue` to `scoped-var-runtime-access.ts`.
  - Removed duplicated local int-read wrappers from `effects-var.ts` and `effects-resource.ts`.
  - Refactored `addVar` and `transferVar` code paths to use the shared int-read primitive.
  - Added/updated unit coverage in:
    - `packages/engine/test/unit/scoped-var-runtime-access.test.ts`
    - `packages/engine/test/unit/effects-var.test.ts`
    - `packages/engine/test/unit/transfer-var.test.ts`
- Deviations from original plan:
  - None. Scope and files touched matched ticket intent; test assumptions were clarified before implementation.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed
  - focused `node --test ...scoped-var-runtime-access...effects-var...transfer-var...` passed
  - `pnpm -F @ludoforge/engine test` passed (`288` passed)
  - `pnpm -F @ludoforge/engine lint` passed
