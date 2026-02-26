# ENGINEARCH-057: Collapse single and batched scoped state writes to one canonical implementation path

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var write-path consolidation + tests
**Deps**: ENGINEARCH-056

## Problem

`writeScopedVarToState` and `writeScopedVarsToState` currently duplicate top-level state assembly. This creates a drift seam where future edits can change one path and not the other.

## Assumption Reassessment (2026-02-26)

1. Single-write and batched-write helpers both rebuild `{ globalVars, perPlayerVars, zoneVars }` into `GameState`.
2. Effect handlers now rely on both APIs (`effects-var` uses single-write, `effects-resource` uses batch-write).
3. Existing unit coverage validates each API independently, but does not directly assert single-write parity against one-item batch-write for all scopes.
4. **Mismatch + correction**: helper architecture should expose one canonical state-assembly path with a thin wrapper for the alternate arity, and tests should explicitly guard parity to prevent drift.

## Architecture Check

1. A single implementation path is cleaner and more extensible than parallel helpers with duplicated immutable merge logic.
2. This is pure runtime plumbing and remains game-agnostic; no GameSpecDoc or visual-config concerns are introduced.
3. No backwards-compatibility shims/aliases are introduced.

## What to Change

### 1. Canonicalize state assembly path

Refactor so either:
- `writeScopedVarToState` delegates to `writeScopedVarsToState`, or
- `writeScopedVarsToState` delegates to single-write composition through one internal state-assembly function.

### 2. Preserve no-op identity behavior

Ensure empty batch remains a no-op with stable state reference identity.

### 3. Add anti-drift regression tests

Add focused tests proving single-write and one-item batch-write produce equivalent state/branch-identity behavior across global, per-player, and zone scopes.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)

## Out of Scope

- Transactional clone minimization/performance work
- Effect semantic changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Single-write and one-item batched write are behaviorally equivalent.
2. Empty batch returns original state reference.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Exactly one canonical state-assembly implementation exists for scoped-var write APIs.
2. Immutable branch identity contracts remain unchanged for unaffected branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add explicit equivalence and anti-drift assertions for single-vs-batch write paths across all scopes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- Actual changes:
  - Collapsed state-level write assembly to one canonical path by making `writeScopedVarToState` delegate to `writeScopedVarsToState`.
  - Removed duplicated top-level `{ globalVars, perPlayerVars, zoneVars }` assembly logic by introducing shared state-branch extraction/application helpers.
  - Added explicit anti-drift parity coverage proving single-write and one-item batch-write are equivalent across global/per-player/zone scopes, including branch identity behavior.
- Deviations from original plan:
  - No deviation in scope; implementation followed the ticket intent.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (291/291).
  - `pnpm -F @ludoforge/engine lint` passed.
