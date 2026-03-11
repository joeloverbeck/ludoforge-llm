# TESTINFRA-003: Suite-scoped compiled game fixtures for large game packages

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — engine test helpers and large-game integration test structure
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-207-first-class-gamespec-bundles-and-single-pass-fingerprints.md`, `archive/tickets/FITLSPEC-102-split-fitl-production-spec-into-imported-fragments.md`, `packages/engine/test/helpers/production-spec-helpers.ts`, `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts`, `packages/engine/test/integration/fitl-active-doubling-victory.test.ts`, `packages/engine/test/integration/compile-verbalization-integration.test.ts`

## Problem

Large-game integration tests currently treat production-game access as a per-assertion convenience call instead of as a suite fixture. The current helper already memoizes the FITL and Texas production compile results process-wide, so the main architectural problem is not literal recompilation on every `it()`. The problem is that runtime suites still repeatedly reach into a compile-oriented helper inside test bodies, which obscures fixture ownership, mixes compile concerns into runtime assertions, and leaves heavy suites relying on an implicit global cache instead of explicit suite-scoped fixtures.

## Assumption Reassessment (2026-03-11)

1. In `packages/engine/test/integration`, many FITL-heavy files still call `compileProductionSpec()` repeatedly within one file and often within multiple `it()` blocks. That structural issue is real.
2. `packages/engine/test/helpers/production-spec-helpers.ts` already caches the loaded bundle and compiled result process-wide, keyed by source fingerprint. Repeated calls in one Node process are mostly repeated fixture lookups, not repeated full production compilation.
3. The current architecture therefore has a mismatch between API shape and behavior: a compile-oriented helper is being used as an implicit runtime fixture provider.
4. A clean fix should make runtime suites own explicit suite-scoped compiled fixtures while leaving compile-focused tests free to call compile helpers when compilation is the subject under test.
5. The right abstraction is generic to any large game package, not FITL-specific, but this ticket should only migrate the files it can verify rather than promising a sweeping test-suite rewrite.

## Architecture Check

1. The cleaner design is to make heavy integration suites depend on explicit suite-scoped compiled game fixtures rather than calling a compile-oriented helper ad hoc inside test bodies.
2. This preserves the core boundary:
   - game-specific rules remain authored in `GameSpecDoc`
   - compiled `GameDef` remains the agnostic runtime contract
   - tests explicitly choose whether they are validating compilation or runtime behavior
3. The architectural goal is not “more caching”; it is clearer ownership. Runtime suites should bind a fixture once per file and then operate on `GameDef` or parsed artifacts directly.
4. Compile helpers may remain for compile-subject tests, but runtime-focused suites touched by this ticket should stop using `compileProductionSpec()` as their default access path.

## What to Change

### 1. Redesign production-game test helpers around explicit fixtures

Refactor `packages/engine/test/helpers/production-spec-helpers.ts` so it exposes suite-friendly primitives, for example:
- load compiled production game bundle once
- extract `GameDef` once
- expose parsed diagnostics separately when a suite genuinely needs them

The helper API should make runtime-fixture consumption the obvious path and direct compile access the explicit path.

### 2. Migrate heavy FITL integration files to suite-scoped fixtures

Refactor the targeted FITL runtime-heavy files so they hoist their compiled production game fixture to module scope and then reuse the compiled `GameDef` across assertions. Tests that validate gameplay behavior should not repeatedly reach through compile helpers.

### 3. Clarify compile-tests vs runtime-tests ownership

Compile-pipeline tests should remain free to compile on demand because compilation is their direct subject. Runtime/rules tests should consume an explicit precompiled fixture unless they are specifically proving compile-time behavior.

### 4. Add guardrails for future large-game tests

Add test helper docs/comments and targeted regression coverage so newly added large-game suites follow the suite-scoped fixture pattern by default.

## Files to Touch

- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- `packages/engine/test/integration/compile-verbalization-integration.test.ts` (modify)
- `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` (modify)
- `packages/engine/test/integration/fitl-active-doubling-victory.test.ts` (modify)
- `packages/engine/test/` helper documentation/comments as needed (modify)

## Out of Scope

- Refactoring generic CNL bundle architecture
- Splitting CI workflows
- Changing game content, `GameSpecDoc`, or `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Heavy FITL runtime/integration suites obtain a compiled production game fixture once per suite file rather than recompiling or re-fetching it inside many `it()` blocks.
2. Compile-focused tests still exercise compilation explicitly where that is the subject under test.
3. Targeted runtime-heavy FITL files no longer depend on repeated `compileProductionSpec()` calls inside individual test bodies.
4. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. Runtime/rules tests consume compiled agnostic `GameDef` fixtures; they do not introduce FITL-specific branches into engine helpers.
2. Test structure makes the distinction between compile assertions and runtime assertions explicit and maintainable for future large games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` — migrate to a suite-scoped compiled fixture and retain existing behavioral coverage.
2. `packages/engine/test/integration/fitl-active-doubling-victory.test.ts` — hoist compiled `GameDef` ownership so runtime assertions operate on an explicit suite fixture.
3. `packages/engine/test/integration/compile-verbalization-integration.test.ts` — keep compilation assertions explicit and avoid conflating it with the runtime-fixture pattern.
4. `packages/engine/test/helpers/production-spec-helpers.ts` — add regression coverage or helper-level assertions as needed to preserve explicit fixture semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-capabilities-march-attack-bombard.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-active-doubling-victory.test.js`
4. `node --test packages/engine/dist/test/integration/compile-verbalization-integration.test.js`
5. `pnpm -F @ludoforge/engine test:integration`
6. `pnpm run check:ticket-deps`

## Outcome

Outcome amended: 2026-03-11

- Completion date: 2026-03-11
- Actual changes:
  - corrected the ticket assumptions to reflect that `compileProductionSpec()` already memoized the FITL/Texas production compile results process-wide
  - added explicit runtime fixture helpers in `packages/engine/test/helpers/production-spec-helpers.ts` for FITL and Texas production games
  - migrated `fitl-active-doubling-victory.test.ts` and `fitl-capabilities-march-attack-bombard.test.ts` to bind the FITL production fixture once at module scope and reuse its `GameDef`
  - expanded that runtime-fixture migration across the heaviest remaining FITL runtime suites, including insurgent operations, COIN operations, US/ARVN and NVA/VC special activities, major capability suites, momentum/runtime regression suites, and several 1965/1968 event suites
  - migrated the remaining Texas runtime suites and cross-game tooltip runtime suites to explicit production fixtures so compile-oriented helpers are now reserved for compile-subject integration coverage
  - added regression coverage in `parse-validate-full-spec.test.ts` to assert stable explicit fixture identity and `GameDef` reuse
- Deviations from original plan:
  - `compile-verbalization-integration.test.ts` did not need code changes because it is compile-focused already and should continue using the compile-oriented helper directly
  - the first implementation pass was intentionally narrowed, then extended after verification showed the explicit fixture API could be applied broadly across runtime-oriented FITL integration files without weakening compile-subject tests
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/integration/fitl-active-doubling-victory.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-capabilities-march-attack-bombard.test.js`
  - `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
  - `node --test packages/engine/dist/test/integration/compile-verbalization-integration.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-coin-operations.test.js packages/engine/dist/test/integration/fitl-insurgent-operations.test.js packages/engine/dist/test/integration/fitl-us-arvn-special-activities.test.js packages/engine/dist/test/integration/fitl-nva-vc-special-activities.test.js`
  - `node --test packages/engine/dist/test/integration/texas-blind-escalation.test.js packages/engine/dist/test/integration/texas-holdem-hand.test.js packages/engine/dist/test/integration/texas-holdem-properties.test.js packages/engine/dist/test/integration/texas-runtime-bootstrap.test.js packages/engine/dist/test/integration/tooltip-cross-game-properties.test.js packages/engine/dist/test/integration/tooltip-pipeline-integration.test.js`
  - `pnpm -F @ludoforge/engine test:integration`
  - `pnpm -F @ludoforge/engine lint` completed with zero errors and existing unrelated warnings only
