# 191PLAROLSEM-004: Semantic golden traces (role-kind/path/stage ↔ frontier)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only (golden-trace fixtures + assertions)
**Deps**: `archive/tickets/191PLAROLSEM-002.md`, `archive/tickets/191PLAROLSEM-003.md`

## Problem

The existing plan tests prove only that selected role values are members of the published legal frontier (`packages/engine/test/architecture/plan-controller-legality-frontier.test.ts`). Nothing pins that authored role target kinds, decision paths, and stage indices *correspond* to the kernel-published continuation frontier at each step — i.e., that the enforcement landed in 191PLAROLSEM-002 (step-match fields) and 191PLAROLSEM-003 (compound sequencing) holds end-to-end on representative templates. Spec 191 §4.4 + §9.

## Assumption Reassessment (2026-05-22)

1. `plan-controller-legality-frontier.test.ts` exists and proves frontier membership + deterministic fallback only — it does not assert path/stage/target-kind correspondence (verified this session; the gap motivating spec 191 §4.4).
2. Golden-trace fixtures live under `packages/engine/test/fixtures/trace/` (e.g., `eval-golden-trace.json`); the determinism lane has `plan-trace-replay.test.ts` — conventional homes for a new golden-trace test (verified 2026-05-22).
3. The correspondence this ticket pins is *enforced* by 191PLAROLSEM-002/003 — without them the traces have nothing to assert against, hence the hard deps.

## Architecture Check

1. Golden traces are the proof object spec 191 §16/§4.4 calls for: they pin the realized correspondence so a future regression in step-match or compound enforcement fails a byte-exact comparison (Foundation #16), not merely a frontier-membership check.
2. Test-only; no engine/runtime change, no game logic in the engine (Foundation #1). FITL templates are exercised as authored data.
3. `@test-class: golden-trace` per `.claude/rules/testing.md`; re-blessable only under the testing-guide protocol (named commit-body reason), preventing silent drift.

## What to Change

### 1. Golden-trace test for semantic correspondence

Add a golden-trace test that, for representative authored templates (e.g., ARVN Train→Govern and one compound/interrupt template), pins the correspondence between each step's authored role target kind / decision path / stage index and the kernel-published continuation frontier at that step. Mark `// @test-class: golden-trace`.

### 2. Pinned fixture

Capture the trace fixture under `packages/engine/test/fixtures/trace/`. Assert replay-identity (same GameDef + seed → byte-identical trace).

## Files to Touch

- `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts` (new — golden-trace assertions; conventional placement alongside `plan-trace-replay.test.ts`)
- `packages/engine/test/fixtures/trace/` (new — pinned correspondence fixture)

## Out of Scope

- The enforcement logic itself (191PLAROLSEM-002/003) — this ticket only pins its observable result.
- Compiler-error corpus tests — those attach to the phase tickets that introduce each diagnostic (001/002/003).

## Acceptance Criteria

### Tests That Must Pass

1. The golden-trace test passes against the post-002/003 engine, pinning role-kind/path/stage ↔ frontier correspondence for the representative templates.
2. Replaying the same GameDef + initial state + seed reproduces a byte-identical trace.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. The pinned correspondence is byte-stable across runs (determinism, Foundation #8/#16).
2. A regression that breaks step-match or compound enforcement fails this golden trace (the test has discriminating power, not a tautology).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts` — `@test-class: golden-trace`; pins per §4.4.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/determinism/plan-semantic-correspondence-golden.test.js`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

Completed: 2026-05-23

What changed:
- Added `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts`, a `@test-class: golden-trace` test that uses the compiled FITL production agent catalog and representative authored templates:
  - `arvn.trainGovern` step 0 and step 1 for Train/Govern path and role-kind correspondence.
  - `arvn.assaultTransportAssault` and `us.assaultAirLiftAssault` stage-0 interrupt templates for stage-index correspondence.
- Added `packages/engine/test/fixtures/trace/plan-semantic-correspondence.golden.json`, pinning each representative template's authored match metadata, consumed frontier context, selected legal option, result decision, and emitted plan microturn trace.
- Added mismatch probes for `decisionPath`, `targetKind`, and `stageIndex`; each falls back instead of exact-matching, so the golden has discriminating power against regressions in the 191PLAROLSEM-002/003 enforcement path.

Generated artifact provenance:
- artifact path(s): `packages/engine/test/fixtures/trace/plan-semantic-correspondence.golden.json`
- generation command: `UPDATE_GOLDEN=1 node --test dist/test/determinism/plan-semantic-correspondence-golden.test.js`
- canonical inputs: compiled FITL production GameDef/agent catalog from `data/games/fire-in-the-lake.game-spec.md`, seed `191004`, representative templates named above
- expected refresh reason: new Spec 191 P4 semantic correspondence golden trace
- generator durability: retained generator: `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts`
- hygiene proof: focused replay command below; final commit hygiene also runs `git diff --check`

Verification:
- `pnpm -F @ludoforge/engine build` — passed after adding the test.
- `UPDATE_GOLDEN=1 node --test dist/test/determinism/plan-semantic-correspondence-golden.test.js` from `packages/engine` — passed and generated the fixture.
- `node --test dist/test/determinism/plan-semantic-correspondence-golden.test.js` from `packages/engine` — passed against the checked-in fixture.
- `pnpm turbo build` — passed.
- `pnpm turbo test` — passed.

Deviations from original plan:
- None. The test and fixture landed at the ticket-named paths and the ticket-named focused and broad verification lanes passed.
