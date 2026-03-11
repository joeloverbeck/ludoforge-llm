# TESTINFRA-003: Suite-scoped compiled game fixtures for large game packages

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — engine test helpers and large-game integration test structure
**Deps**: `tickets/README.md`, `tickets/ENGINEARCH-207-first-class-gamespec-bundles-and-single-pass-fingerprints.md`, `archive/tickets/FITLSPEC-102-split-fitl-production-spec-into-imported-fragments.md`, `packages/engine/test/helpers/production-spec-helpers.ts`, `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts`, `packages/engine/test/integration/fitl-active-doubling-victory.test.ts`, `packages/engine/test/integration/compile-verbalization-integration.test.ts`

## Problem

Large-game integration tests currently treat production-game compilation as a per-assertion convenience call instead of as a suite fixture. Even with a corrected bundle-first compile path, repeatedly compiling or re-fetching the same production game inside one test file is the wrong ownership model. This creates unnecessary runtime, obscures the true cost of gameplay assertions, and scales poorly as more large board/card games are added.

## Assumption Reassessment (2026-03-11)

1. In `packages/engine/test/integration`, FITL-heavy files call `compileProductionSpec()` repeatedly within one file and often within multiple `it()` blocks. This is a structural test design issue independent of the current helper inefficiency.
2. The slowest sampled files are dominated by repeated access to the same compiled FITL production game rather than by one unavoidable gameplay assertion.
3. A clean fix should not hide cost with process-global hacks. It should make compiled production-game fixtures an explicit suite-level input owned by the tests that need them.
4. The right abstraction is generic to any large game package, not FITL-specific.

## Architecture Check

1. The cleaner design is to make heavy integration suites depend on explicit suite-scoped compiled game fixtures rather than calling production compilation ad hoc inside test bodies.
2. This preserves the core boundary:
   - game-specific rules remain authored in `GameSpecDoc`
   - compiled `GameDef` remains the agnostic runtime contract
   - tests explicitly choose whether they are validating compilation or runtime behavior
3. No backwards-compatibility shim should preserve `compileProductionSpec()` as the default repeated access pattern for large-game tests. Helpers should guide authors toward one compile per suite file unless a test is explicitly about recompilation behavior.

## What to Change

### 1. Redesign production-game test helpers around explicit fixtures

Refactor `packages/engine/test/helpers/production-spec-helpers.ts` so it exposes suite-friendly primitives, for example:
- load compiled production game bundle once
- extract `GameDef` once
- expose parsed diagnostics separately when a suite genuinely needs them

The helper API should make repeated per-test compilation the awkward path rather than the default path.

### 2. Migrate heavy FITL integration files to suite-scoped fixtures

Refactor the slowest FITL integration files so they hoist their compiled production game fixture to module scope or other suite scope and then reuse the compiled `GameDef` across assertions. Tests that validate gameplay behavior should not repeatedly re-enter compilation.

### 3. Clarify compile-tests vs runtime-tests ownership

Compile-pipeline tests should remain free to compile on demand because compilation is their direct subject. Runtime/rules tests should consume a precompiled fixture unless they are specifically proving compile-time behavior.

### 4. Add guardrails for future large-game tests

Add test helper docs/comments and targeted regression coverage so newly added large-game suites follow the suite-scoped fixture pattern by default.

## Files to Touch

- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- `packages/engine/test/integration/compile-verbalization-integration.test.ts` (modify)
- `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` (modify)
- `packages/engine/test/integration/fitl-active-doubling-victory.test.ts` (modify)
- additional FITL-heavy files under `packages/engine/test/integration/` that repeatedly access the same production compile result (modify)
- `packages/engine/test/` helper documentation/comments as needed (modify)

## Out of Scope

- Refactoring generic CNL bundle architecture
- Splitting CI workflows
- Changing game content, `GameSpecDoc`, or `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Heavy FITL runtime/integration suites obtain a compiled production game fixture once per suite file rather than recompiling or re-fetching it inside many `it()` blocks.
2. Compile-focused tests still exercise compilation explicitly where that is the subject under test.
3. Sampled long-running FITL files show materially reduced wall-clock runtime after migration.
4. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. Runtime/rules tests consume compiled agnostic `GameDef` fixtures; they do not introduce FITL-specific branches into engine helpers.
2. Test structure makes the distinction between compile assertions and runtime assertions explicit and maintainable for future large games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` — migrate to a suite-scoped compiled fixture and retain existing behavioral coverage.
2. `packages/engine/test/integration/fitl-active-doubling-victory.test.ts` — hoist compiled `GameDef` ownership so runtime assertions measure runtime logic rather than repeated compilation.
3. `packages/engine/test/integration/compile-verbalization-integration.test.ts` — keep compilation assertions but ensure repeated FITL access is intentional and minimal.
4. `packages/engine/test/helpers/production-spec-helpers.ts` — add regression coverage or helper-level assertions as needed to preserve suite fixture semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-capabilities-march-attack-bombard.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-active-doubling-victory.test.js`
4. `node --test packages/engine/dist/test/integration/compile-verbalization-integration.test.js`
5. `pnpm -F @ludoforge/engine test:integration`
6. `pnpm run check:ticket-deps`
