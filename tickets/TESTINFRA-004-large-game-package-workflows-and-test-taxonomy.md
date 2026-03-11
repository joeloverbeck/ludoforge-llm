# TESTINFRA-004: Large game-package workflows and test taxonomy

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test scripts/workflows and test classification; no runtime/kernel behavior changes
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-207-first-class-gamespec-bundles-and-single-pass-fingerprints.md`, `archive/tickets/TESTINFRA/TESTINFRA-003-suite-scoped-compiled-game-fixtures-for-large-game-packages.md`, `archive/tickets/TESTINFRA-002-add-cnl-visual-config-import-boundary-guard.md`, `.github/workflows/ci.yml`, `.github/workflows/engine-e2e-all.yml`, `packages/engine/package.json`, `package.json`, `turbo.json`

## Problem

The current CI model separates only broad package-level concerns, while large game-package integration suites still run inside the default engine test lane. As the repository grows to include multiple complex games, this will make the default CI path slower, noisier, and less diagnosable. Large game packages should be first-class test units with their own workflows and taxonomy, not incidental passengers inside the generic engine suite.

## Assumption Reassessment (2026-03-11)

1. The current root CI workflow runs `pnpm turbo test`, which includes the engine default test command. Heavy FITL integration therefore contributes directly to the main CI critical path.
2. There is already precedent for dedicated workflows, such as the all-E2E engine workflow. The repo can support additional targeted workflows without introducing a novel CI architecture.
3. Future games with similarly large `GameSpecDoc` packages are expected, so a FITL-only local optimization would be too narrow.
4. The correct split is by test intent and game-package scope, not by introducing game-specific engine code or by burying gameplay validation in runner-only checks.

## Architecture Check

1. The cleaner design is to define an explicit test taxonomy:
   - engine core tests
   - game-package compile tests
   - game-package runtime/rules tests
   - runner visual-config compatibility tests
2. This preserves the main ownership boundaries:
   - engine core remains game-agnostic
   - game-specific behavior remains in `GameSpecDoc` and associated game-package tests
   - visual presentation remains in `visual-config.yaml` and runner-owned validation
3. No backwards-compatibility shims should preserve “all large-game integration in the default engine lane” as the canonical model. The default lane should stay fast and architecture-focused.

## What to Change

### 1. Define a large-game-package test taxonomy

Document and encode a repository-level classification for:
- engine core unit/integration
- large-game compile/regression suites
- large-game runtime/rules suites
- runner visual-config compatibility suites

This classification should inform scripts, workflow names, and where new tests belong.

### 2. Add dedicated engine workflow(s) for large game packages

Create dedicated GitHub workflow(s) for large game-package suites, starting with FITL, so these suites run independently from the default CI critical path while still remaining mandatory quality gates where appropriate.

### 3. Narrow the default engine test lane

Adjust engine/root scripts so the default CI path focuses on engine-core tests plus a minimal compile smoke check for large games. Heavy game-package rules suites should move to their dedicated workflow(s).

### 4. Keep runner visual-config validation separate

Ensure `visual-config.yaml` compatibility checks remain either in runner tests or in clearly named compatibility workflows, not mixed into engine-core semantics.

## Files to Touch

- `.github/workflows/ci.yml` (modify)
- `.github/workflows/` (add new large-game workflow files)
- `packages/engine/package.json` (modify)
- `package.json` (modify)
- `turbo.json` (modify if task partitioning changes)
- `docs/` or `README.md` documentation for test taxonomy/workflow ownership (modify)

## Out of Scope

- Rewriting CNL compile architecture
- Rewriting existing FITL rules tests beyond what is needed to classify or invoke them
- Adding game-specific behavior to engine, runtime, or kernel

## Acceptance Criteria

### Tests That Must Pass

1. The default CI workflow no longer carries the full heavy FITL rules suite in its critical path.
2. A dedicated large-game workflow exists for FITL and is structured so the same pattern can be used for future complex games.
3. Engine-core tests remain green in the default lane, and large-game workflows remain green in their own lane.
4. Existing suite: `pnpm turbo test`
5. New dedicated workflow command(s) for large-game packages are runnable locally and in CI.

### Invariants

1. Engine-core quality gates remain game-agnostic and do not depend on per-game branching or per-game engine behavior.
2. Large-game package workflows validate `GameSpecDoc`-authored behavior and compiled `GameDef` behavior without collapsing visual-config concerns into engine-core tests.

## Test Plan

### New/Modified Tests

1. Workflow-level validation through `.github/workflows/*.yml` and associated script changes — verify default CI and dedicated large-game workflow commands target the intended suites.
2. Engine script coverage in `packages/engine/package.json` and root `package.json` — verify test commands cleanly separate core vs large-game package execution.
3. Documentation update in `docs/` or `README.md` — explain where future large-game suites belong and how they are invoked.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo test`
3. `<new local command for engine-core lane>`
4. `<new local command for FITL or large-game-package lane>`
5. `pnpm run check:ticket-deps`
