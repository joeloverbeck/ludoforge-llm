# CIENG-001: Harden Path Filters for Engine Special-Suite Workflows

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — CI workflow trigger coverage only
**Deps**: .github/workflows/engine-e2e-all.yml, .github/workflows/engine-memory.yml, .github/workflows/engine-performance.yml

## Problem

Engine special-suite workflows now exist, but current path filters may miss shared config/tooling changes that can affect engine build/test behavior (for example root TS/tooling config). That can lead to false confidence when workflows are skipped on impactful changes.

## Assumption Reassessment (2026-03-06)

1. Dedicated workflows for engine e2e-all, memory, and performance are present.
2. Their `paths` filters include engine/data/scripts/workflow files and package manager metadata.
3. Engine build/test execution depends on root-shared config/tooling files that are currently excluded from those filters, specifically `tsconfig.base.json` and `eslint.config.js`.
4. No automated policy test currently enforces parity/coverage invariants for these three workflow `paths` lists.

## Architecture Check

1. Better path coverage improves CI reliability without forcing these suites into every local ticket run.
2. This is CI plumbing only and does not alter GameDef/runtime architecture.
3. A test-enforced workflow policy is architecturally stronger than review-only conventions because it is explicit, deterministic, and regression-resistant.
4. No compatibility shims are introduced.

## What to Change

### 1. Expand workflow path filters conservatively

Add shared config/tooling paths that can impact engine build/test execution, with concrete minimum coverage:

- `tsconfig.base.json`
- `eslint.config.js`

### 2. Add a lightweight policy test or documentation guard

Add an explicit policy test under `packages/engine/test/unit/lint/` to keep special-suite workflow filters aligned and in parity on required path classes.

## Files to Touch

- `.github/workflows/engine-e2e-all.yml` (modify)
- `.github/workflows/engine-memory.yml` (modify)
- `.github/workflows/engine-performance.yml` (modify)
- `packages/engine/test/unit/lint/*` (modify/add)

## Out of Scope

- Reworking main CI matrix structure.
- Moving special suites into default local test commands.

## Acceptance Criteria

### Tests That Must Pass

1. Path filters include all agreed shared config categories that can affect engine special suites.
2. Workflow trigger behavior remains selective (not universal) while avoiding known false skips.
3. New/updated lint policy test enforcing parity and required-path coverage for the three workflow files.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Special suites remain separate from normal ticket test loops.
2. CI remains the enforcement point for these suites.

## Test Plan

### New/Modified Tests

1. Add guard test under `packages/engine/test/unit/lint/` to enforce workflow-path parity and required root-shared config coverage.

### Commands

1. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-03-06
- **What changed**:
  - Added `tsconfig.base.json` and `eslint.config.js` to `push.paths` and `pull_request.paths` for:
    - `.github/workflows/engine-e2e-all.yml`
    - `.github/workflows/engine-memory.yml`
    - `.github/workflows/engine-performance.yml`
  - Added `packages/engine/test/unit/lint/engine-special-suite-workflow-path-policy.test.ts` to enforce:
    - push/pull_request path-list parity per workflow
    - required shared path coverage across all three special-suite workflows
    - shared-path parity across the three workflows
    - self-workflow path trigger presence for each workflow
- **Deviations from original plan**:
  - Converted the guard from optional to mandatory because review-only validation is weaker and allows silent drift.
  - Replaced manual `workflow_dispatch` verification in the ticket test plan with deterministic local policy-test enforcement.
- **Verification results**:
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/engine-special-suite-workflow-path-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (398/398).
