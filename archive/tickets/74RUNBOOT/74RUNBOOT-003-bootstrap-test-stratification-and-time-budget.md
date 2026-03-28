# 74RUNBOOT-003: Bootstrap Test Stratification And Time Budget

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/74RUNBOOT/74RUNBOOT-002-bootstrap-test-cache-clarity.md

## Problem

The current runner bootstrap test surface mixes two different concerns inside the default runner suite:

- lightweight contract checks for query parsing, descriptor fallback, and bootstrap API shape
- expensive production-fixture integration checks that load and validate full FITL/Texas bootstrap assets

As a result, small contract tests inherit the performance budget of heavy fixture-backed integration work. The current suite passes, but the architecture is not ideal: test intent, cost, and failure mode are blurred together, and default-suite timing becomes harder to reason about over time.

## Assumption Reassessment (2026-03-28)

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` currently mixes the thin `resolveBootstrapConfig` contract seam with real bootstrap-fixture resolution and visual-config invariants. Confirmed, and this is the main architectural mismatch.
2. `packages/runner/test/bootstrap/runner-bootstrap.test.ts` already sits closer to the correct ownership boundary because `runner-bootstrap` is the module that actually parses visual config, validates references, resolves `GameDef`, and derives bootstrap capabilities. Confirmed.
3. Only two bootstrap tests currently carry explicit `20000` ms timeouts: the default Texas path in `resolve-bootstrap-config.test.ts` and the FITL resolved-bootstrap path in `runner-bootstrap.test.ts`. Confirmed. The timeouts are not pervasive, but they are currently attached to tests whose costs are different enough that the budget ownership should be clearer.
4. The currently proposed targeted command in this ticket is inaccurate for the repo's runner script. `pnpm -F @ludoforge/runner test -- test/...` passes a literal `--` through to Vitest and does not scope execution as intended. Confirmed. The correct shape is `pnpm -F @ludoforge/runner test test/...`.
5. The repo already distinguishes verification layers elsewhere; a bootstrap-specific contract-vs-integration split fits existing engineering practice. Confirmed by the broader split between unit/contract/integration coverage across the repo.

## Architecture Check

1. The cleaner architecture is to align tests with the existing production seam, not to invent a new seam. `resolve-bootstrap-config` should own cheap query parsing, descriptor fallback, and handle wiring assertions; `runner-bootstrap` should own fixture-backed resolution, validation, and capability proofs.
2. This aligns with `docs/FOUNDATIONS.md` by keeping “testing as proof” precise: cheap tests prove the thin browser/bootstrap API contract, while heavier tests prove actual fixture integration and visual-config reference validity at the module that implements those behaviors.
3. No compatibility aliases or duplicate test semantics should remain. Assertions about `GameDef` validation, visual-config schema parsing, visual-config reference validation, and capability derivation should live under `runner-bootstrap`, because that is the code that performs those responsibilities.
4. Time budgets should attach to intentional fixture-backed integration paths, not to thin wrapper tests whose contract can be proven with mocks.

## What to Change

### 1. Realign tests to the bootstrap module seam

Reorganize the runner bootstrap test surface so:

- lightweight query parsing, fallback, seed/player parsing, and handle-wiring assertions stay in `resolve-bootstrap-config` contract tests
- full production fixture resolution, visual-config validation, reference validation, and capability derivation assertions live in `runner-bootstrap` integration-oriented tests

The split can be by renamed files or by clearly separated `describe` blocks, but ownership and intent must be obvious from structure and naming.

### 2. Define bootstrap test budgeting rules at the right boundary

Document and enforce simple rules for bootstrap tests, for example:

- `resolve-bootstrap-config` contract tests should avoid full FITL/Texas fixture loads; they should use mocks or stubs unless the contract specifically requires the real handle behavior
- fixture-backed `runner-bootstrap` assertions should be grouped intentionally and carry any explicit timeout expectations
- timeouts should be justified by fixture-loading scope, not used as a generic fix for duplicated work or mis-scoped tests

This can live in bootstrap-test comments or a small README in the test area if that is the cleanest home.

### 3. Keep real fixture-backed proof in `runner-bootstrap`

Do not over-mock the suite. The stratified architecture should still preserve real end-to-end bootstrap proof for:

- descriptor -> `GameDef` resolution
- visual-config parsing
- visual-config reference validation
- capability derivation such as `supportsMapEditor`

These proofs should sit in `runner-bootstrap` tests, because that module owns those responsibilities.

## Files to Touch

- `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (modify or split)
- `packages/runner/test/bootstrap/runner-bootstrap.test.ts` (modify or split)
- `packages/runner/test/bootstrap/*` (add integration-oriented bootstrap test file(s) if needed)
- `packages/runner/test/bootstrap/README.md` or similar local documentation file (new, if helpful)

## Out of Scope

- Any production bootstrap logic changes
- Engine/kernel/compiler changes
- Global Vitest project splitting for the whole runner suite unless clearly required
- Reworking unrelated slow runner tests outside bootstrap coverage

## Acceptance Criteria

### Tests That Must Pass

1. Bootstrap contract tests run without needing full production fixture resolution unless the assertion explicitly requires it.
2. Real fixture-backed bootstrap integration coverage still exists in `runner-bootstrap` tests for descriptor resolution, visual-config validation, and capability derivation.
3. Bootstrap test files/suites make their cost level and purpose obvious from structure and naming.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Thin `resolve-bootstrap-config` assertions and heavy `runner-bootstrap` integration assertions are not conflated without justification.
2. Real production bootstrap assets remain covered by at least one automated `runner-bootstrap` test path.
3. Timeout values reflect intentional workload, not accidental repeated setup.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` or split replacement files — separate query/default contract coverage from heavy fixture-backed assertions.
   Rationale: this file currently crosses the `resolve-bootstrap-config` module boundary and proves behavior that belongs to `runner-bootstrap`.
2. `packages/runner/test/bootstrap/runner-bootstrap.test.ts` or split replacement files — become the canonical home for real fixture-backed bootstrap proofs and validation failure paths.
   Rationale: this keeps bootstrap-handle semantics understandable and makes time-budget ownership explicit at the module that owns fixture loading and validation.
3. `packages/runner/test/bootstrap/README.md` or local documentation assertions if added.
   Rationale: the suite structure itself becomes part of the architecture and should be discoverable.

### Commands

1. `pnpm -F @ludoforge/runner test test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/runner-bootstrap.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Corrected the ticket's original assumption that both bootstrap test files were equally mis-scoped. The real issue was narrower: `resolve-bootstrap-config` tests were crossing into `runner-bootstrap` responsibilities.
  - Reworked `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` into a pure contract suite that uses mocks to prove query parsing, descriptor fallback, numeric parsing, and handle wiring without loading production fixtures.
  - Expanded `packages/runner/test/bootstrap/runner-bootstrap.test.ts` to become the canonical home for real fixture-backed bootstrap proofs and validation-failure coverage, including Texas and FITL happy paths plus invalid fixture/schema/reference failure cases.
  - Added `packages/runner/test/bootstrap/README.md` to document the seam, cost model, and the correct targeted Vitest command shape.
- Deviations from original plan:
  - Did not create a broad new bootstrap integration test hierarchy or Vitest project split. The existing production seam was already sufficient; the cleaner fix was to align tests to that seam rather than introduce more structure.
  - Did not change production bootstrap code, because the architecture issue was test ownership and scope, not runtime behavior.
  - Removed the need for explicit long per-test timeouts instead of formalizing them, because once the tests were moved to the correct boundary the focused bootstrap suite stayed comfortably within the default Vitest budget.
- Verification results:
  - Passed: `pnpm -F @ludoforge/runner test test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/runner-bootstrap.test.ts`
  - Passed: `pnpm -F @ludoforge/runner test`
  - Passed: `pnpm -F @ludoforge/runner typecheck`
  - Passed: `pnpm turbo lint`
  - Passed: `pnpm run check:ticket-deps`
