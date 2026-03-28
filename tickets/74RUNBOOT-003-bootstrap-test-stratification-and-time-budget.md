# 74RUNBOOT-003: Bootstrap Test Stratification And Time Budget

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: tickets/74RUNBOOT-002-runner-bootstrap-test-harness-cache.md

## Problem

The current runner bootstrap test surface mixes two different concerns inside the default runner suite:

- lightweight contract checks for query parsing, descriptor fallback, and bootstrap API shape
- expensive production-fixture integration checks that load and validate full FITL/Texas bootstrap assets

As a result, small contract tests inherit the performance budget of heavy fixture-backed integration work. The current suite passes, but the architecture is not ideal: test intent, cost, and failure mode are blurred together, and default-suite timing becomes harder to reason about over time.

## Assumption Reassessment (2026-03-28)

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` currently combines lightweight query/default assertions with full production fixture resolution in the same file. Confirmed.
2. `packages/runner/test/bootstrap/runner-bootstrap.test.ts` includes at least one expensive FITL resolved-bootstrap integration assertion alongside cheaper API/unknown-id tests. Confirmed.
3. Runner suite execution under `pnpm turbo test` is sensitive enough that these bootstrap integration tests recently required higher explicit timeouts to avoid false negatives. Confirmed from current test state.
4. The repo already distinguishes stronger-vs-lighter verification surfaces in other places; a bootstrap-specific stratification would fit existing engineering practice rather than introducing a new philosophy. Confirmed by the broader split between contract tests, golden tests, and integration tests across the repo.

## Architecture Check

1. The cleaner architecture is to separate bootstrap contract tests from production-fixture bootstrap integration tests so each class has an explicit cost model and verification role.
2. This aligns with `docs/FOUNDATIONS.md` by keeping “testing as proof” precise: cheap tests prove API/default behavior, while heavier tests prove real fixture integration and visual-config reference validity. Each proof point becomes more legible.
3. No compatibility aliases or duplicate test semantics should remain. Each assertion should live in the cheapest suite that still proves the right invariant.
4. A documented bootstrap time budget will age better than silently increasing per-test timeouts whenever fixtures grow.

## What to Change

### 1. Split bootstrap contract tests from fixture-backed integration tests

Reorganize the runner bootstrap test surface so:

- lightweight query parsing, fallback, and API-shape assertions stay in fast default-path tests
- full production fixture resolution and validation assertions move to explicitly named integration-style bootstrap tests or files

The split can be by file or by `describe` block plus targeted commands, but ownership and intent must be obvious.

### 2. Define bootstrap test budgeting rules

Document and enforce simple rules for bootstrap tests, for example:

- default bootstrap contract tests should avoid full FITL/Texas fixture loads unless the assertion specifically needs them
- expensive fixture-backed assertions should be grouped intentionally and given explicit timeout expectations
- timeouts should be justified by fixture-loading scope, not used as a generic fix for duplicated work

This can live in bootstrap-test comments or a small README in the test area if that is the cleanest home.

### 3. Keep at least one real fixture-backed proof per bootstrap path

Do not over-mock the suite. The stratified architecture should still preserve real end-to-end bootstrap proof for:

- descriptor -> `GameDef` resolution
- visual-config parsing
- visual-config reference validation
- capability derivation such as `supportsMapEditor`

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
2. Real fixture-backed bootstrap integration coverage still exists for descriptor resolution, visual-config validation, and capability derivation.
3. Bootstrap test files/suites make their cost level and purpose obvious from structure and naming.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Cheap contract assertions and heavy fixture-backed assertions are not conflated in the same default-path test shapes without justification.
2. Real production bootstrap assets remain covered by at least one automated runner test path.
3. Timeout values reflect intentional workload, not accidental repeated setup.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` or split replacement files — separate query/default contract coverage from heavy fixture-backed assertions.
   Rationale: this file currently mixes the two test classes most visibly.
2. `packages/runner/test/bootstrap/runner-bootstrap.test.ts` or split replacement files — isolate expensive resolved-bootstrap integration checks from lightweight descriptor/API behavior.
   Rationale: this keeps bootstrap-handle semantics understandable and makes time-budget ownership explicit.
3. `packages/runner/test/bootstrap/README.md` or local documentation assertions if added.
   Rationale: the suite structure itself becomes part of the architecture and should be discoverable.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/runner-bootstrap.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`
