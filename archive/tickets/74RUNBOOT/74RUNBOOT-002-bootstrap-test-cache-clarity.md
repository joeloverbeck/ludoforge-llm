# 74RUNBOOT-002: Runner Bootstrap Test Harness Cache

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/74RUNBOOT/74RUNBOOT-001-unified-runner-bootstrap-service.md

## Problem

The ticket originally assumed that runner bootstrap happy-path tests were repeatedly rebuilding the full production bootstrap stack inside individual test cases. That assumption does not hold in the current codebase.

What is actually true today:

- production bootstrap caching already lives in `packages/runner/src/bootstrap/runner-bootstrap.ts`
- the happy-path bootstrap tests do not call `vi.resetModules()` between cases, so they already benefit from module-scoped cache reuse within each test file
- the real architectural issue is test clarity, not missing cross-suite caching: happy-path tests still use ad hoc dynamic-import helpers that make cache ownership harder to see, while mocked failure-path tests correctly rely on isolated module state

The risk is therefore architectural ambiguity rather than raw repeated fixture cost. If the tests keep mixing “normal cached bootstrap” and “isolated mocked bootstrap” behind the same import pattern, future changes can accidentally hide cache semantics or over-engineer test infrastructure.

## Assumption Reassessment (2026-03-28)

1. `packages/runner/src/bootstrap/runner-bootstrap.ts` already owns a production `bootstrapHandleCache`. Confirmed.
2. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` and `packages/runner/test/bootstrap/runner-bootstrap.test.ts` do use ad hoc dynamic-import helpers, but their happy-path tests do not reset modules between cases. Corrected: those tests already reuse module-scoped cache within each file.
3. The current mock-driven failure tests intentionally use `vi.resetModules()` and dynamic imports to isolate mocked module state. Confirmed, and this should remain explicit rather than being hidden behind a shared happy-path harness.
4. There is still no direct test proving the intended bootstrap cache invariants at the service layer. Corrected gap: this ticket should strengthen cache-behavior coverage instead of introducing extra harness indirection.
5. The work remains runner-only bootstrap/test infrastructure; no kernel/game-specific branching belongs here. Confirmed.

## Architecture Check

1. The cleaner architecture is not a new shared cross-suite harness. The production bootstrap service already owns caching; tests should express that directly instead of wrapping it in another abstraction.
2. Happy-path tests should import the bootstrap modules normally so cache reuse is obvious. Mock-driven tests should keep their isolated import/reset flow so cache invalidation remains explicit.
3. Direct bootstrap-cache assertions belong in bootstrap tests, because they prove the architectural invariant without smearing new helper state across the suite.
4. This stays aligned with `docs/FOUNDATIONS.md`: game-specific data remains in production bootstrap fixtures and `visual-config.yaml`; the ticket only clarifies and strengthens runner-side test ownership.
5. No backwards-compatibility shims, alias APIs, or permanent duplicate helper layers should be introduced.

## What to Change

### 1. Remove unnecessary happy-path fresh-import indirection

Update the bootstrap happy-path tests so they import the production bootstrap modules directly instead of routing everything through ad hoc “fresh import” helpers.

This makes the real architecture visible:

- happy paths use the real module-scoped cache
- mocked failure paths opt into isolation intentionally

### 2. Keep mocked failure isolation explicit

Retain `vi.resetModules()` plus dynamic imports only in tests that mock bootstrap modules or fixture inputs. Those tests should continue to prove failure semantics under isolated module state.

### 3. Add direct cache-invariant coverage

Strengthen bootstrap tests so they prove the real invariant at the correct layer:

- repeated handle resolution for the same descriptor reuses the cached bootstrap handle
- repeated happy-path resolution reuses the same parsed visual-config/provider layer rather than silently rebuilding it

Avoid introducing a new shared helper layer unless a test proves it owns non-trivial behavior that cannot be expressed cleanly in the tests themselves.

## Files to Touch

- `packages/runner/test/bootstrap/*` (modify tests; add helper only if non-trivial behavior justifies it)
- `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (modify)
- `packages/runner/test/bootstrap/runner-bootstrap.test.ts` (modify)
- `packages/runner/test/bootstrap/bootstrap-registry.test.ts` (modify only if cache-ownership assertions fit better there)

## Out of Scope

- Any engine/kernel/compiler changes
- Changing production bootstrap descriptor semantics
- Reclassifying which bootstrap tests belong in default vs non-default suites
- Vite/Vitest global configuration changes unrelated to bootstrap-test clarity/coverage
- Introducing a suite-level bootstrap harness solely to cache work that is already cached by production code

## Acceptance Criteria

### Tests That Must Pass

1. Bootstrap happy-path tests use direct production-module imports where isolation is not required.
2. Mocked bootstrap failure tests still have an explicit isolated path and do not accidentally share cached production state.
3. Bootstrap cache invariants are covered directly by tests at the bootstrap service layer.
4. Existing bootstrap behavior assertions remain intact after migration.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Test changes do not introduce game-specific logic into runner runtime code.
2. Production bootstrap validation behavior remains proven by tests, not bypassed.
3. Cache reuse and cache invalidation are explicit in test code, not hidden behind a helper abstraction.
4. Any new helper must justify its existence by owning behavior, not by wrapping imports.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` — remove unnecessary happy-path fresh-import indirection and keep isolated mocked imports only where needed.
   Rationale: this makes the real cache semantics visible in the test structure.
2. `packages/runner/test/bootstrap/runner-bootstrap.test.ts` — add direct cache-invariant coverage while preserving explicit mocked failure isolation.
   Rationale: cache behavior belongs in bootstrap-service tests, not in a new test harness abstraction.
3. `packages/runner/test/bootstrap/bootstrap-registry.test.ts` — modify only if needed for descriptor/cache ownership clarity.
   Rationale: keep the diff surgical and avoid spreading the ticket beyond the bootstrap seam that actually owns the invariant.

### Commands

1. `pnpm -F @ludoforge/runner test test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/runner-bootstrap.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Corrected the ticket’s core assumption: happy-path bootstrap tests were not repeatedly defeating the production cache, so a shared suite-level harness was not justified.
  - Simplified bootstrap happy-path tests to use direct production-module imports.
  - Kept dynamic-import plus `vi.resetModules()` isolation only for mocked failure-path tests.
  - Added direct bootstrap cache-invariant coverage in `runner-bootstrap.test.ts` to prove handle/result reuse explicitly.
- Deviations from original plan:
  - Did not add a dedicated bootstrap test harness, because that would have duplicated production cache ownership and obscured the current architecture rather than improving it.
  - Did not modify `bootstrap-registry.test.ts`, because the corrected scope stayed fully within the bootstrap service/test seam.
- Verification results:
  - Passed: `pnpm -F @ludoforge/runner test test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/runner-bootstrap.test.ts`
  - Passed: `pnpm -F @ludoforge/runner test`
  - Passed: `pnpm -F @ludoforge/runner typecheck`
  - Passed: `pnpm turbo lint`
  - Passed: `pnpm run check:ticket-deps`
