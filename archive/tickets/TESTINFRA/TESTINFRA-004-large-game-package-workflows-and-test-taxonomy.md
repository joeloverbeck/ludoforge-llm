# TESTINFRA-004: Large game-package workflows and test taxonomy

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test scripts/workflows and test classification; no runtime/kernel behavior changes
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-207-first-class-gamespec-bundles-and-single-pass-fingerprints.md`, `archive/tickets/TESTINFRA/TESTINFRA-003-suite-scoped-compiled-game-fixtures-for-large-game-packages.md`, `archive/tickets/TESTINFRA-002-add-cnl-visual-config-import-boundary-guard.md`, `.github/workflows/ci.yml`, `.github/workflows/engine-e2e-all.yml`, `packages/engine/package.json`, `package.json`, `turbo.json`

## Problem

The current CI model separates only broad package-level concerns, while large game-package integration suites still run inside the default engine test lane. As the repository grows to include multiple complex games, this will make the default CI path slower, noisier, and less diagnosable. Large game packages should be first-class test units with their own workflows and taxonomy, not incidental passengers inside the generic engine suite.

## Assumption Reassessment (2026-03-11)

1. The root CI workflow still runs `pnpm turbo test`, and the engine package `test` script still contributes directly to that critical path. That part of the original assumption remains correct.
2. The repo no longer has only broad package-level workflows. It already has dedicated engine workflows for `e2e`, `memory`, and `performance`, plus a guard test in `packages/engine/test/unit/lint/engine-special-suite-workflow-path-policy.test.ts` that enforces them as a first-class pattern. The ticket must build on that existing architecture rather than pretending it does not exist.
3. The engine default `test` script is already narrower than the ticket originally implied: `packages/engine/scripts/run-tests.mjs` defaults to unit plus integration only, while `memory`, `performance`, and `e2e` are already split out. The remaining CI gap is specifically that game-package-scoped integration tests still ride inside the default integration lane.
4. FITL is the dominant current large game package, but Texas and cross-game production-package tests already exist as well. The taxonomy should therefore be expressed as engine-core vs game-package integration ownership, with a minimal production smoke subset retained in the default lane.
5. Runner `visual-config.yaml` validation is already exercised under `packages/runner/test/config/visual-config-files.test.ts` and related runner tests. This ticket should preserve that ownership boundary rather than moving visual-config validation into engine workflows.

## Architecture Check

1. The cleaner design is to define an explicit test taxonomy:
   - engine core tests
   - game-package smoke/compile-regression tests
   - game-package dedicated integration/rules tests
   - runner visual-config compatibility tests
2. This preserves the main ownership boundaries:
   - engine core remains game-agnostic
   - game-specific behavior remains in `GameSpecDoc` and associated game-package tests
   - visual presentation remains in `visual-config.yaml` and runner-owned validation
3. The robust implementation is to use an explicit engine-owned lane manifest and named scripts/workflows, not ad hoc filename negation scattered across CI YAML. That gives future game packages one place to join the taxonomy.
4. No backwards-compatibility shims should preserve “all game-package integration in the default engine lane” as the canonical model. The default lane should stay fast and architecture-focused.

## What to Change

### 1. Define a large-game-package test taxonomy

Document and encode a repository-level classification for:
- engine core unit/integration
- game-package smoke/compile-regression suites that stay in the default lane
- dedicated game-package integration/rules suites that move to their own lane
- runner visual-config compatibility suites

This classification should inform scripts, workflow names, and where new tests belong.

### 2. Add dedicated engine workflow(s) for large game packages

Create a dedicated GitHub workflow for game-package integration suites so those suites run independently from the default CI critical path while still remaining first-class quality gates. The first workflow may currently be dominated by FITL/Texas coverage, but the taxonomy must not be FITL-specific.

### 3. Narrow the default engine test lane

Adjust engine/root scripts so the default CI path focuses on engine-core tests plus a minimal production-package smoke set. Game-package integration/rules suites should move to their dedicated workflow.

### 4. Keep runner visual-config validation separate

Ensure `visual-config.yaml` compatibility checks remain either in runner tests or in clearly named compatibility workflows, not mixed into engine-core semantics.

## Files to Touch

- `.github/workflows/` (add/modify engine workflow files)
- `packages/engine/package.json` (modify)
- `package.json` (modify)
- `packages/engine/scripts/` (modify/add lane-manifest support)
- `docs/` or `README.md` documentation for test taxonomy/workflow ownership (modify)
- `packages/engine/test/unit/lint/` guard tests for workflow/script taxonomy (modify/add)

## Out of Scope

- Rewriting CNL compile architecture
- Rewriting existing FITL rules tests beyond what is needed to classify or invoke them
- Adding game-specific behavior to engine, runtime, or kernel

## Acceptance Criteria

### Tests That Must Pass

1. The default CI workflow no longer carries the full game-package integration/rules suite in its critical path.
2. A dedicated engine game-package workflow exists and is structured so the same pattern can be used for future game packages without changing engine architecture.
3. Engine-core tests remain green in the default lane, and game-package workflows remain green in their own lane.
4. Existing suite: `pnpm turbo test`
5. New dedicated workflow command(s) for game-package suites are runnable locally and in CI.

### Invariants

1. Engine-core quality gates remain game-agnostic and do not depend on per-game engine branching or per-game runtime behavior in engine code.
2. Game-package workflows validate `GameSpecDoc`-authored behavior and compiled `GameDef` behavior without collapsing visual-config concerns into engine-core tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/engine-special-suite-workflow-path-policy.test.ts` — extend workflow-path parity coverage to the new dedicated engine game-package workflow.
2. `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` — guard the package scripts and lane manifest so core-vs-game-package routing cannot silently drift.
3. Workflow-level validation through `.github/workflows/*.yml` and associated script changes — verify default CI and dedicated game-package workflow commands target the intended suites.
4. Documentation update in `README.md` — explain where future game-package suites belong and how they are invoked.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo test`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm -F @ludoforge/engine test:integration:core`
6. `pnpm -F @ludoforge/engine test:integration:game-packages`
7. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-11
- What actually changed:
  - corrected the ticket assumptions to reflect the current repo: dedicated engine special-suite workflows already existed, the engine default lane was already narrower than the ticket claimed, and the real gap was game-package-scoped integration still riding the default engine lane
  - added `packages/engine/scripts/test-lane-manifest.mjs` as the explicit engine-owned taxonomy source for core integration, game-package smoke coverage, and dedicated game-package integration coverage
  - updated `packages/engine/scripts/run-tests.mjs` and `packages/engine/package.json` so the engine now exposes explicit `test:integration:core` and `test:integration:game-packages` lanes while keeping `test:integration` as the full integration aggregate
  - added root script entry points in `package.json` and documented the lane split in `README.md`
  - added `.github/workflows/engine-game-packages.yml` and extended the workflow-path parity guard so the new workflow participates in the existing special-suite workflow architecture
  - added `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` so future changes cannot silently collapse game-package suites back into the default lane or drift the manifest/scripts
- Deviations from original plan:
  - `.github/workflows/ci.yml` did not require direct edits because the default CI narrowing is achieved by the engine package `test` command that `pnpm turbo test` already invokes
  - the implemented naming was intentionally generalized from “large game” toward “game-package” lanes because that is the cleaner long-term architecture for future production packages beyond FITL
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/lint/engine-special-suite-workflow-path-policy.test.js packages/engine/dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js` ✅
  - `pnpm -F @ludoforge/engine test:integration:core` ✅
  - `pnpm -F @ludoforge/engine test:integration:game-packages` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`# pass 340`, `# fail 0`)
  - `pnpm -F @ludoforge/engine test:integration` ✅ (`# pass 167`, `# fail 0`)
  - `pnpm run check:ticket-deps` ✅
  - `pnpm turbo lint` ✅ with existing repository warnings only, no errors
  - `pnpm turbo test` ✅
