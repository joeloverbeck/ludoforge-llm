# REPOOPS-001: Stabilize GitNexus header stats in guidance docs

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — repository workflow/docs hygiene
**Deps**: AGENTS.md, CLAUDE.md, package.json

## Problem

`npx gitnexus analyze` rewrites numeric repository stats in `AGENTS.md` and `CLAUDE.md` (`symbols`, `relationships`, `execution flows`). These values are operationally non-critical and create noisy unrelated diffs that increase merge churn and reduce signal in implementation commits.

## Assumption Reassessment (2026-03-05)

1. The GitNexus index can be stale relative to `HEAD`; after running `npx gitnexus analyze`, only numeric stat lines changed in `AGENTS.md` and `CLAUDE.md`.
2. There is currently no dedicated guard that prevents stat-only GitNexus churn from being mixed into feature/bugfix commits.
3. Current script test coverage (`scripts/check-ticket-deps.test.mjs`) does not cover this GitNexus stat-churn case.
4. These doc stat edits are not required for engine/runtime behavior, ticket dependency integrity, or game-spec execution correctness.

## Architecture Decision

1. Keep a single canonical policy: GitNexus counter updates are allowed only as dedicated maintenance-only changes.
2. Enforce policy with a focused repository guard script that detects counter-only edits in `AGENTS.md`/`CLAUDE.md` when unrelated files are also changed.
3. Do not introduce compatibility aliases or game-specific logic. Keep this a generic repo-hygiene invariant.

## What to Change

### 1. Add deterministic guard behavior for GitNexus header counters

1. Detect changed files from local/staged diffs and CI diff mode.
2. If `AGENTS.md`/`CLAUDE.md` changes are counter-line-only and other files also changed, fail with actionable diagnostics.
3. If counter-line-only changes are isolated (no unrelated paths), allow and print maintenance guidance.

### 2. Add script-level tests

1. Add tests for pass/fail behavior covering:
   - no stat churn,
   - isolated stat-only churn,
   - mixed-purpose churn (must fail),
   - non-counter edits in guidance docs (must not be treated as stat-only churn).

### 3. Wire guard into repo workflow

1. Add an npm script entry for the new guard.
2. Include guard execution in the root test/check path.

## Files to Touch

- `tickets/REPOOPS-001-stabilize-gitnexus-header-stats-in-guidance-docs.md` (this reassessment)
- `scripts/` (new guard script + tests)
- `package.json` (guard command wiring)

## Out of Scope

- Engine kernel/runtime behavior changes
- Ticket archival integrity logic (`tickets/KERQUERY-016-enforce-active-ticket-reference-integrity-after-archival.md`)
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Repository workflow has a deterministic policy for GitNexus header stat churn.
2. Automated guard catches mixed-purpose counter churn and allows isolated maintenance-only churn.
3. Guard script tests pass.
4. Existing quality gate remains green (`pnpm run check:ticket-deps`).

### Invariants

1. Guidance-doc operational metadata updates do not pollute feature/bugfix diffs.
2. GameDef/runtime/simulator remain game-agnostic and unaffected.

## Test Plan

### New/Modified Tests

1. Add a guard-script test file under `scripts/` validating stat-churn detection and mixed-change blocking.

### Commands

1. `pnpm run check:ticket-deps`
2. `node --test scripts/check-gitnexus-header-stats.test.mjs`
3. `pnpm test`

## Outcome

- **Completion date**: 2026-03-05
- **What changed**
1. Added `scripts/check-gitnexus-header-stats.mjs` guard enforcing that GitNexus counter-only churn in `AGENTS.md`/`CLAUDE.md` cannot be mixed with unrelated file changes.
2. Added `scripts/check-gitnexus-header-stats.test.mjs` with scenario coverage for clean state, isolated counter-only churn, blocked mixed-purpose churn, and non-counter guidance edits.
3. Wired guard into root workflow via `package.json` scripts:
   - `guard:gitnexus-header-stats`
   - `test` now runs `check:ticket-deps` + `guard:gitnexus-header-stats` before `turbo test`.
- **Deviations from original plan**
1. No policy text edits were required in `AGENTS.md`/`CLAUDE.md`; enforcement is centralized in an automated guard to avoid duplicating process rules.
2. Guard tests were implemented by importing the guard function directly (instead of nested Node subprocess execution) due environment-level subprocess restrictions in tests.
- **Verification results**
1. `pnpm run check:ticket-deps` passed.
2. `node --test scripts/check-gitnexus-header-stats.test.mjs` passed.
3. `pnpm test` passed (engine + runner suites green).
4. Post-archive refinement (same date): extracted shared git guard utilities into `scripts/git-guard-utils.mjs`, refactored both guards to use it, and added `scripts/check-worktree-pointers.test.mjs`.
