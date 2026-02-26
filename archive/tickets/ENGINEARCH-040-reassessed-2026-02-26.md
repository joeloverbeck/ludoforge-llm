# ENGINEARCH-040: Consolidate scoped-var runtime access primitives across var/resource effects

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes - kernel effect runtime refactor + tests
**Deps**: none

## Problem

`scoped-var-runtime-access.ts` now exists with canonical helpers for scoped-var definition lookup, typed reads, immutable writes, and selector/zone normalization. However, `effects-var.ts` and `effects-resource.ts` still keep parallel scope-branch access logic (global/per-player/zone) in local helpers, so the architecture is only partially consolidated and remains drift-prone.

## Assumption Reassessment (2026-02-26)

1. `scoped-var-runtime-mapping.ts` centralizes runtime scope translation for trace/event payloads.
2. `scoped-var-runtime-access.ts` already exists and exposes shared scoped-var runtime access primitives (`resolveScopedVarDef`, `resolveScopedIntVarDef`, `readScopedVarValue`, `writeScopedVarToBranches`) plus selector normalization utilities.
3. `effects-var.ts` and `effects-resource.ts` still duplicate scoped access concerns in local helper trees instead of consistently consuming the shared runtime access module.
4. Existing tests already cover broad behavior parity for `setVar`, `addVar`, and `transferVar`, and there is direct unit coverage for `scoped-var-runtime-access.ts`; this ticket is about architectural consolidation, not introducing new behavior.
5. **Mismatch + correction**: the ticket originally framed helper extraction as new work; the real gap is full adoption of already-extracted helpers inside effect handlers.

## Architecture Check

1. Full helper adoption is more robust than the current mixed architecture: one canonical access path per concern prevents semantic drift when scoped-var contracts evolve.
2. This is game-agnostic kernel/runtime refactoring only; no game-specific behavior should be introduced.
3. No backward-compatibility aliasing or shim behavior should be added.
4. Prefer strengthening branch-identity invariants in tests so immutable write contracts remain explicit after refactor.

## What to Change

### 1. Complete helper adoption in effect handlers

Refactor `applySetVar`, `applyAddVar`, and `applyTransferVar` to use shared access primitives from `scoped-var-runtime-access.ts` for:
- scoped definition lookup
- typed runtime reads
- immutable scoped writes

Preserve existing runtime validation/error code families and selector normalization behavior.

### 2. Remove duplicate scoped access helpers from effect modules

Delete now-redundant per-scope local helper logic in `effects-var.ts` and `effects-resource.ts` once equivalent shared helpers are used.

### 3. Strengthen tests for architectural invariants

Keep behavior the same while adding/adjusting tests where useful to lock down:
- no-op reference identity expectations
- unaffected branch identity on scoped writes
- parity of trace/event payloads across scopes

## Files to Touch

- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/test/unit/effects-var.test.ts` (modify/add)
- `packages/engine/test/unit/transfer-var.test.ts` (modify/add)

## Out of Scope

- New gameplay mechanics or new effect types
- Changes to `GameSpecDoc` schema content
- Runner/UI/visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Scoped-var read/write semantics remain identical for `setVar`, `addVar`, and `transferVar`.
2. Scope resolution/definition lookup/read/write behavior in var/resource effects goes through shared runtime access primitives rather than duplicated per-effect branch trees.
3. Existing and updated unit coverage passes for effect behaviors and scoped helper invariants.
4. `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped-variable runtime access behavior has one canonical implementation path per concern.
2. Kernel/runtime logic remains game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-var.test.ts` - maintain/extend behavior parity and branch identity invariants after helper adoption.
2. `packages/engine/test/unit/transfer-var.test.ts` - maintain/extend behavior parity and branch identity invariants after helper adoption.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What was actually changed:
  - Refactored `packages/engine/src/kernel/effects-var.ts` to consume shared scoped runtime helpers for endpoint resolution, scoped definition lookup, scoped reads, and immutable scoped writes.
  - Refactored `packages/engine/src/kernel/effects-resource.ts` to consume shared scoped runtime helpers for `transferVar` definition lookup, scoped reads, and immutable scoped writes.
  - Removed duplicated scoped access/write helper trees from effect modules.
  - Added test coverage for branch-identity invariants:
    - `effects-var.test.ts`: zoneVar set writes only zone branch.
    - `transfer-var.test.ts`: zoneVar->zoneVar transfer preserves unrelated global/per-player branch references.
- Deviations from originally planned ticket framing:
  - The ticket initially described helper extraction as pending work, but the helper module already existed; actual work focused on completing helper adoption in effect handlers and removing remaining duplication.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
