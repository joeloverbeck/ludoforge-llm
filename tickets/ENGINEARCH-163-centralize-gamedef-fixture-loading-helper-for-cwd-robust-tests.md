# ENGINEARCH-163: Centralize GameDef fixture loading helper for cwd-robust tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test helper boundary (`packages/engine/test/helpers`) + unit test refactors
**Deps**: archive/tickets/TOKFILT-004-token-filter-contract-module-boundary.md

## Problem

GameDef fixture loading logic is duplicated across validator tests, and direct `node --test dist/...` command behavior can regress when fixture resolution is reimplemented inconsistently.

## Assumption Reassessment (2026-03-01)

1. `validate-gamedef.test.ts`, `validate-gamedef-input.test.ts`, and `validate-gamedef.golden.test.ts` each carry local fixture path logic.
2. The repository already uses shared helpers in `packages/engine/test/helpers/`, but there is no dedicated shared helper for GameDef fixture path resolution.
3. No active ticket in `tickets/*` currently tracks deduplicating these GameDef fixture loaders.

## Architecture Check

1. Shared fixture loaders reduce drift and strengthen deterministic test execution across command shapes.
2. This is test-architecture cleanup only; no `GameDef`/runtime behavior changes.
3. No compatibility shims; tests should rely on one canonical helper.

## What to Change

### 1. Add a shared GameDef fixture loader helper

Create helper(s) in `packages/engine/test/helpers/` that resolve fixture paths in both source/dist contexts.

### 2. Refactor current validator tests to use the helper

Replace per-file duplicated loader functions in affected tests with imports from the new helper.

### 3. Extend helper use where straightforward

Adopt helper in other GameDef fixture tests when low-risk and clearly same behavior.

## Files to Touch

- `packages/engine/test/helpers/*gamedef*` (new/modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef-input.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.golden.test.ts` (modify)
- optional: additional GameDef fixture tests that currently duplicate loader logic

## Out of Scope

- Production code behavior changes
- Non-GameDef fixture helper standardization for all test domains
- Runner and `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. All affected validator tests pass from both package-root and repo-root invocation shapes.
2. Duplicated local GameDef fixture loader functions are removed from targeted tests.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Test fixture resolution remains deterministic and cwd-robust.
2. Engine runtime behavior remains unchanged and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — use shared helper; preserve existing assertions.
2. `packages/engine/test/unit/validate-gamedef-input.test.ts` — use shared helper; preserve existing assertions.
3. `packages/engine/test/unit/validate-gamedef.golden.test.ts` — use shared helper; preserve existing assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef-input.test.js`
4. `node --test packages/engine/dist/test/unit/validate-gamedef.golden.test.js`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
