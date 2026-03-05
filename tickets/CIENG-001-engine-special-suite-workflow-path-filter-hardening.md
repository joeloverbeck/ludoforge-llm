# CIENG-001: Harden Path Filters for Engine Special-Suite Workflows

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — CI workflow trigger coverage only
**Deps**: .github/workflows/engine-e2e-all.yml, .github/workflows/engine-memory.yml, .github/workflows/engine-performance.yml

## Problem

Engine special-suite workflows now exist, but current path filters may miss shared config/tooling changes that can affect engine build/test behavior (for example root TS/tooling config). That can lead to false confidence when workflows are skipped on impactful changes.

## Assumption Reassessment (2026-03-06)

1. Dedicated workflows for engine e2e-all, memory, and performance are present.
2. Their `paths` filters include engine/data/scripts/workflow files and package manager metadata.
3. Some potentially impactful shared config files are not included in those filters.

## Architecture Check

1. Better path coverage improves CI reliability without forcing these suites into every local ticket run.
2. This is CI plumbing only and does not alter GameDef/runtime architecture.
3. No compatibility shims are introduced.

## What to Change

### 1. Expand workflow path filters conservatively

Add shared config/tooling paths that can impact engine build/test execution (for example root `tsconfig*.json`, repo-wide lint/test config files as applicable).

### 2. Add a lightweight policy test or documentation guard

Add an explicit policy check or docs note to keep special-suite workflow filters aligned with engine-impacting file classes.

## Files to Touch

- `.github/workflows/engine-e2e-all.yml` (modify)
- `.github/workflows/engine-memory.yml` (modify)
- `.github/workflows/engine-performance.yml` (modify)
- `docs/*` or `packages/engine/test/unit/lint/*` (modify/add, if guard is implemented)

## Out of Scope

- Reworking main CI matrix structure.
- Moving special suites into default local test commands.

## Acceptance Criteria

### Tests That Must Pass

1. Path filters include all agreed shared config categories that can affect engine special suites.
2. Workflow trigger behavior remains selective (not universal) while avoiding known false skips.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Special suites remain separate from normal ticket test loops.
2. CI remains the enforcement point for these suites.

## Test Plan

### New/Modified Tests

1. `.github/workflows/*.yml` review-based validation — ensure filter parity across the three special-suite workflows.
2. Optional guard test (if implemented) under `packages/engine/test/unit/lint/` to enforce declared workflow-path policy.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. (Manual) trigger each workflow via `workflow_dispatch` to confirm execution.
