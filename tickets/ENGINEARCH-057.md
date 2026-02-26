# ENGINEARCH-057: Collapse single and batched scoped state writes to one canonical implementation path

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var write-path consolidation + tests
**Deps**: ENGINEARCH-056

## Problem

`writeScopedVarToState` and `writeScopedVarsToState` currently duplicate top-level state assembly. This creates a drift seam where future edits can change one path and not the other.

## Assumption Reassessment (2026-02-26)

1. Single-write and batched-write helpers both rebuild `{ globalVars, perPlayerVars, zoneVars }` into `GameState`.
2. Effect handlers now rely on both APIs (`effects-var` uses single-write, `effects-resource` uses batch-write).
3. **Mismatch + correction**: helper architecture should expose one canonical state-assembly path with a thin wrapper for the alternate arity.

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

Add focused tests proving single-write and one-item batch-write produce equivalent state/identity behavior.

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

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add equivalence and anti-drift assertions for single-vs-batch write paths.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
