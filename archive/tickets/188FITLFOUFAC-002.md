# 188FITLFOUFAC-002: Engine-agnosticism guard test — no faction/action identifiers in packages/engine/src

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/specs/188-fitl-four-faction-plan-migration-and-sequencing.md`

## Problem

Spec 188 authors four FITL faction personalities entirely in YAML (`data/games/fire-in-the-lake/92-agents.md`) and asserts no FITL-specific identifiers leak into the engine (Foundation #1). There is currently a lint-test for the visual-config import boundary but no guard asserting that faction/action identifiers (`ARVN`, `NVA`, `VC`, `FITL`, action tags like `Sweep`/`Raid`) do not appear as hardcoded logic in `packages/engine/src/`. This ticket adds that guard so the agnosticism property is proven by an automated test rather than assumed.

## Assumption Reassessment (2026-05-21)

1. An analogous lint-test convention exists: `packages/engine/test/unit/lint/engine-agnostic-visual-config-import-boundary-policy.test.ts` (confirmed during Spec 188 reassessment). The new guard follows that file's scanning pattern.
2. Engine tests run with `node --test` against compiled `dist/` (per CLAUDE.md). The guard test must be authored to compile and run under that runner.
3. The guard must tolerate legitimate occurrences (e.g., test fixtures, diagnostic strings) — scope it to `packages/engine/src/**/*.ts` and exclude comments/diagnostic message text per the existing lint-test's exclusion approach.

## Architecture Check

1. Encodes Foundation #1 as a regression test — a clean, declarative guard rather than ad-hoc review discipline.
2. Scans only `packages/engine/src/` (the agnostic layers); game data under `data/games/` and test fixtures are correctly out of scope.
3. No backwards-compatibility concerns — additive test.

## What to Change

### 1. Author the guard test

Add a test under `packages/engine/test/unit/lint/` that scans `packages/engine/src/{cnl,kernel,agents,sim}/**/*.ts` and asserts none contain hardcoded faction identifiers (`ARVN`/`arvn`, `NVA`/`nva`, `VC`/`vc` as a standalone token, `FITL`/`fitl`) or FITL action-tag string literals (`Sweep`, `Raid`, `Govern`, `Patrol`, `Transport`, `Rally`, `Infiltrate`, `Subvert`, etc.) in non-comment code paths. Mirror the exclusion logic of the existing visual-config boundary lint test.

### 2. Add the test-class marker

Per `.claude/rules/testing.md`, mark the file `// @test-class: architectural-invariant` — it asserts a property that must hold across every legitimate engine evolution.

## Files to Touch

- `packages/engine/test/unit/lint/engine-agnostic-faction-identifier-boundary-policy.test.ts` (new)

## Out of Scope

- No changes to engine source — if the guard fails on existing code, that is a real Foundation #1 violation to be raised via the 1-3-1 rule, not silenced by narrowing the guard.
- Does not scan `packages/runner/` (separate boundary, separate ticket scope).

## Acceptance Criteria

### Tests That Must Pass

1. The new guard test passes against the current engine source (no faction identifiers present today).
2. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. `packages/engine/src/` contains no hardcoded FITL faction or action identifiers (Foundation #1).
2. The guard is game-agnostic — it asserts absence of FITL tokens but is not itself FITL-specific infrastructure beyond the token list it scans for.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/engine-agnostic-faction-identifier-boundary-policy.test.ts` — proves no faction/action identifiers leak into engine source.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/lint/engine-agnostic-faction-identifier-boundary-policy.test.js`
2. `pnpm turbo test`

## Outcome

Completed on 2026-05-21.

What changed:

- Added `packages/engine/test/unit/lint/engine-agnostic-faction-identifier-boundary-policy.test.ts` with the required `// @test-class: architectural-invariant` marker.
- The guard scans `packages/engine/src/{agents,cnl,kernel,sim}` using the TypeScript AST so comments and substring matches inside generic diagnostic names do not create false positives.
- The guard fails on hardcoded FITL faction identifiers in code identifiers and exact FITL action-tag string literals in agnostic engine source.

Deviations from original plan:

- The final broad verification used the package-local ticket lane `pnpm -F @ludoforge/engine test:all`, matching the ticket acceptance criterion, instead of root `pnpm turbo test`.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/lint/engine-agnostic-faction-identifier-boundary-policy.test.js` — passed, 1 test.
- `pnpm -F @ludoforge/engine test:all` — passed, 957 tests.
