# 63PHAPREFOR-004: Integration test — FITL ARVN Phase 1 preview differentiation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — integration tests
**Deps**: `archive/tickets/63PHAPREFOR-003.md`

## Problem

The spec's core motivation is that FITL ARVN agent evolution campaigns produce identical game traces regardless of weight tuning because Phase 1 cannot discriminate between action types. After tickets 001-003 implement the feature and migrate fixtures, this ticket proves the feature works end-to-end: Phase 1 preview differentiation is observable, deterministic, and has negligible performance impact.

## Assumption Reassessment (2026-04-10)

1. `compileProductionSpec()` test helper at `packages/engine/test/helpers/production-spec-helpers.ts` — compiles the production FITL spec. Confirmed available for integration tests.
2. `event-preview-differentiation.test.ts` — existing test at `packages/engine/test/integration/` proves preview margins differentiate for events. The pattern can be extended for Phase 1 template operations.
3. `PolicyAgent` constructor accepts `{ traceLevel: 'verbose' }` which exposes `candidates` with `scoreContributions` in the agent decision trace — confirmed at `policy-agent.ts:23`. Required to inspect `projectedSelfMargin` contributions.
4. After tickets 001-003, `phase1: true` can be set in profile YAML and compiled into `CompiledAgentPreviewConfig`.

## Architecture Check

1. Integration test operates through the public `PolicyAgent.chooseMove()` API — no internal coupling (Foundation 5).
2. Determinism assertion uses same-seed replay — the canonical approach per Foundation 16.
3. Performance assertion guards against regression per spec Success Criteria 5 (< 5% per-decision time increase).
4. Test uses production FITL spec to prove the feature works on a real game, not a synthetic fixture (Foundation 16 — conformance corpus).

## What to Change

### 1. New integration test file

Create `packages/engine/test/integration/phase1-preview-differentiation.test.ts`:

**Test 1: Phase 1 projectedSelfMargin varies across action types**
- Compile the production FITL spec with one profile overridden to `phase1: true`
- Run a `PolicyAgent` with `traceLevel: 'verbose'` on a fixed seed
- Extract Phase 1 `candidates` from the decision trace
- Assert that `projectedSelfMargin` score contributions are NOT all identical across template operation candidates (at least 2 distinct values)
- This directly validates spec Success Criterion 1

**Test 2: Determinism — same seed produces identical Phase 1 results**
- Run the same seed twice with `phase1: true`
- Assert bit-identical Phase 1 candidate scores and action ranking
- This validates spec Success Criterion 4

**Test 3: Performance — Phase 1 preview overhead is negligible**
- Time N decisions (e.g., 10) with `phase1: false` and `phase1: true`
- Assert the per-decision time increase is < 5%
- Mark as `{ todo: true }` or skip in CI if timing is too environment-sensitive — the assertion is informational, not a hard gate

## Files to Touch

- `packages/engine/test/integration/phase1-preview-differentiation.test.ts` (new)

## Out of Scope

- Enabling `phase1: true` on production FITL profiles (data change, not engine change)
- Running full ARVN evolution campaigns (spec Success Criterion 2 is validated manually via campaign runs, not automated tests)
- Changing the representative selection heuristic

## Acceptance Criteria

### Tests That Must Pass

1. Phase 1 `projectedSelfMargin` contributions have at least 2 distinct values across template operation candidates when `phase1: true`
2. Same seed produces identical Phase 1 scores and rankings (determinism)
3. Performance overhead < 5% per decision (informational, may be skipped in CI)
4. Full suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Test uses the production FITL spec — no synthetic GameDef that could drift from reality
2. Test operates through the public `PolicyAgent` API, not internal functions
3. Determinism assertion compares canonical values, not hashes (per Foundation 8, 16)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/phase1-preview-differentiation.test.ts` — Phase 1 preview differentiation, determinism, and performance

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "phase1.*preview.*differentiation"`
2. `pnpm turbo build && pnpm turbo test`
