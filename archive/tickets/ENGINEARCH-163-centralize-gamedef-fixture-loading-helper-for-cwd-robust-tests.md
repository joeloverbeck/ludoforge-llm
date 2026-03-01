# ENGINEARCH-163: Centralize GameDef fixture loading helper for cwd-robust tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test helper boundary (`packages/engine/test/helpers`) + unit test refactors
**Deps**: archive/tickets/TOKFILT-004-token-filter-contract-module-boundary.md

## Problem

GameDef fixture loading logic is duplicated across validator tests, and direct `node --test dist/...` command behavior can regress when fixture resolution is reimplemented inconsistently.

## Assumption Reassessment (2026-03-01)

1. `validate-gamedef.test.ts`, `validate-gamedef-input.test.ts`, and `validate-gamedef.golden.test.ts` each carry local fixture path logic.
2. `packages/engine/test/helpers/gamedef-fixtures.ts` already exists, but currently only provides in-memory GameDef builders and does not provide JSON fixture loading.
3. Additional tests also duplicate GameDef fixture loading (`packages/engine/test/unit/property/core-types-validation.property.test.ts`, `packages/engine/test/integration/core-types-validation.integration.test.ts`) and currently use `process.cwd()` joins that are less robust across invocation shapes.
4. No active ticket in `tickets/*` currently tracks deduplicating these GameDef fixture loaders.

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

Adopt helper in other GameDef fixture tests when low-risk and clearly same behavior, including current `core-types-validation` unit/integration tests.

## Files to Touch

- `packages/engine/test/helpers/*gamedef*` (new/modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef-input.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.golden.test.ts` (modify)
- `packages/engine/test/unit/property/core-types-validation.property.test.ts` (modify)
- `packages/engine/test/integration/core-types-validation.integration.test.ts` (modify)

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
4. `packages/engine/test/unit/property/core-types-validation.property.test.ts` — replace local `process.cwd()` loader with shared helper; preserve assertions.
5. `packages/engine/test/integration/core-types-validation.integration.test.ts` — replace local `process.cwd()` loader with shared helper; preserve assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef-input.test.js`
4. `node --test packages/engine/dist/test/unit/validate-gamedef.golden.test.js`
5. `node --test packages/engine/dist/test/unit/property/core-types-validation.property.test.js`
6. `node --test packages/engine/dist/test/integration/core-types-validation.integration.test.js`
7. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Added generic shared fixture reader support in `packages/engine/test/helpers/fixture-reader.ts`:
    - `readFixtureText(relativePath)`
    - `readFixtureJson<T>(relativePath)`
    - fixture resolution anchored at repository root (`packages/engine/test/fixtures`) without `process.cwd()` or source/dist aliasing.
  - Updated `packages/engine/test/helpers/gamedef-fixtures.ts` to delegate JSON loading to the generic fixture reader via `readGameDefFixture(...)`.
  - Refactored validator tests to use the shared loader:
    - `packages/engine/test/unit/validate-gamedef.test.ts`
    - `packages/engine/test/unit/validate-gamedef-input.test.ts`
    - `packages/engine/test/unit/validate-gamedef.golden.test.ts`
  - Extended low-risk adoption to additional duplicated GameDef fixture consumers:
    - `packages/engine/test/unit/property/core-types-validation.property.test.ts`
    - `packages/engine/test/integration/core-types-validation.integration.test.ts`
  - Extended migration to remaining engine tests that were reading fixtures via `process.cwd()` path joins, including:
    - `packages/engine/test/unit/property/eval.property.test.ts`
    - `packages/engine/test/integration/eval-complex.test.ts`
    - `packages/engine/test/unit/eval.golden.test.ts`
    - `packages/engine/test/unit/serde.test.ts`
    - `packages/engine/test/unit/initial-state.test.ts`
    - `packages/engine/test/integration/fitl-turn-flow-golden.test.ts`
    - `packages/engine/test/integration/fitl-card-flow-determinism.test.ts`
    - `packages/engine/test/integration/sim/simulator-golden.test.ts`
    - `packages/engine/test/unit/parser-validator.golden.test.ts`
    - `packages/engine/test/integration/parse-validate-full-spec.test.ts`
    - `packages/engine/test/integration/sim/simulator.test.ts`
    - `packages/engine/test/integration/fitl-events-full-deck.test.ts`
    - `packages/engine/test/integration/gamespec-capability-conformance.test.ts`
  - Resulting invariant: engine test fixture reads are centralized through helper APIs and no longer depend on `process.cwd()`-anchored fixture path joins.
- **Deviations from Original Plan**:
  - Scope expanded from the original three validator files to include two additional low-risk GameDef fixture tests identified during assumption reassessment.
  - Further refined after archival to establish one generic fixture-reading contract across engine tests; migration expanded beyond GameDef-only tests to eliminate remaining `process.cwd()` fixture path coupling.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef-input.test.js` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef.golden.test.js` passed.
  - `node --test packages/engine/dist/test/unit/property/core-types-validation.property.test.js` passed.
  - `node --test packages/engine/dist/test/integration/core-types-validation.integration.test.js` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm run check:ticket-deps` passed.
