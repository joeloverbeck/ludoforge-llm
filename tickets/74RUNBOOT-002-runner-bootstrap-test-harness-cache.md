# 74RUNBOOT-002: Runner Bootstrap Test Harness Cache

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/74RUNBOOT/74RUNBOOT-001-unified-runner-bootstrap-service.md

## Problem

Runner bootstrap tests repeatedly pay the full cost of module reload, descriptor resolution, `GameDef` validation, visual-config parsing, and FITL fixture loading inside individual test cases. The current behavior is still correct, but it is the wrong long-term architecture for test infrastructure:

- contract-style tests are coupled to production fixture load cost
- `vi.resetModules()` plus fresh dynamic imports recreate the same expensive bootstrap state over and over
- suite stability currently depends on raising per-test timeouts rather than reducing redundant work

This makes the bootstrap test surface slower and more fragile than it should be, especially under full `pnpm turbo test` load.

## Assumption Reassessment (2026-03-28)

1. `packages/runner/src/bootstrap/runner-bootstrap.ts` already owns a production `bootstrapHandleCache`, but that cache is module-scoped and is defeated whenever tests call `vi.resetModules()` and re-import bootstrap modules. Confirmed.
2. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` and `packages/runner/test/bootstrap/runner-bootstrap.test.ts` both use ad hoc fresh-import helpers and repeatedly call `resolveGameDef()` against production FITL/Texas fixtures. Confirmed.
3. The current bootstrap tests do not share a dedicated harness/helper file for stable cached descriptors, resolved bootstrap handles, or fixture-backed assertions. Confirmed.
4. The expensive work is runner-only bootstrap composition and visual-config validation; no kernel/game-specific branching needs to be introduced to improve this. Corrected scope: this ticket is test-infrastructure work only.

## Architecture Check

1. The clean architecture is a dedicated runner-bootstrap test harness that centralizes expensive fixture-backed bootstrap setup once per test module or suite, rather than rebuilding it ad hoc in each test body.
2. This stays aligned with `docs/FOUNDATIONS.md`: game-specific data remains in production bootstrap fixtures and `visual-config.yaml`; the harness only controls how tests consume those assets, not the runtime contracts themselves.
3. No backwards-compatibility shims or alias APIs should be added. Tests should migrate to the new harness directly instead of preserving duplicate “fresh import” helpers forever.
4. The harness should preserve explicit cache invalidation for mocked tests so fixture-backed happy-path tests can be fast without making mock-driven failure tests implicit or brittle.

## What to Change

### 1. Add a dedicated bootstrap test harness

Create a helper under `packages/runner/test/bootstrap/` that can:

- load production bootstrap descriptors intentionally
- resolve bootstrap handles and/or resolved runner bootstrap results once
- expose explicit cache-reset helpers for tests that need isolated mocked module state
- separate fixture-backed helpers from mocked/bootstrap-failure helpers

The harness should make expensive fixture-backed setup obvious instead of hiding it behind repeated inline imports.

### 2. Migrate fixture-backed bootstrap tests to the harness

Update the bootstrap tests that currently re-import modules and resolve FITL/Texas fixtures repeatedly so they use the shared harness for production-fixture happy paths.

Mock-driven failure-path tests may still use isolated module resets, but only where test isolation truly requires it.

### 3. Keep cache behavior explicit in tests

The harness should expose explicit invalidation/reset entry points so tests can state whether they are:

- reusing a production bootstrap fixture result
- verifying cache reuse
- intentionally invalidating module state to test mocked error behavior

Avoid hidden global mutable test state.

## Files to Touch

- `packages/runner/test/bootstrap/*` (add harness helper(s))
- `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (modify)
- `packages/runner/test/bootstrap/runner-bootstrap.test.ts` (modify)
- `packages/runner/test/bootstrap/bootstrap-registry.test.ts` (modify if harness use is beneficial)

## Out of Scope

- Any engine/kernel/compiler changes
- Changing production bootstrap descriptor semantics
- Reclassifying which bootstrap tests belong in default vs non-default suites
- Vite/Vitest global configuration changes unrelated to bootstrap-test harnessing

## Acceptance Criteria

### Tests That Must Pass

1. Bootstrap happy-path tests can reuse a shared fixture-backed harness instead of ad hoc fresh-import helpers.
2. Mocked bootstrap failure tests still have an explicit isolated path and do not accidentally share cached production state.
3. Existing bootstrap behavior assertions remain intact after migration.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Test helpers do not introduce game-specific logic into runner runtime code.
2. Production bootstrap validation behavior remains proven by tests, not bypassed.
3. Cache reuse and cache invalidation are explicit in test code, not hidden side effects.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` — migrate happy-path bootstrap assertions to the shared harness.
   Rationale: this is currently one of the heaviest fixture-backed tests and the clearest proof that the harness reduces redundant work.
2. `packages/runner/test/bootstrap/runner-bootstrap.test.ts` — migrate resolved-bootstrap happy-path coverage to the shared harness while preserving explicit mocked failure isolation.
   Rationale: this keeps bootstrap-handle and fully resolved runner-bootstrap tests aligned on one fixture-loading strategy.
3. `packages/runner/test/bootstrap/<new-harness-test>.test.ts` or equivalent helper coverage — prove cache reuse and explicit invalidation semantics if the harness has non-trivial logic.
   Rationale: the harness becomes shared infrastructure and should have direct tests if it owns behavior.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/runner-bootstrap.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`
