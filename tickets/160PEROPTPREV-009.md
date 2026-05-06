# 160PEROPTPREV-009: FITL canary golden test for inner preview

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/160PEROPTPREV-005.md`, `tickets/160PEROPTPREV-006.md`, `tickets/160PEROPTPREV-007.md`

## Problem

Spec 160 §AC #6 requires a pinned FITL canary golden test demonstrating that `preview.inner.chooseOne: true` with a `preferOptionProjectedMargin` consideration produces byte-identical projected-margin values across runs. Golden traces guard against silent drift in per-option preview output.

This ticket adds the golden test, modeled on `packages/engine/test/integration/synthetic-decision-fitl-canary-golden.test.ts`. The test uses a diagnostic FITL profile (or an existing one extended with `preview.inner.chooseOne: true` + `preferOptionProjectedMargin` consideration) and pins the resulting trace fixture.

## Assumption Reassessment (2026-05-06)

1. Ticket 005 has landed the chooseOne driver; ticket 006 has the beam driver; ticket 007 has the trace integration. The full Phase A+B+C feature is exercisable.
2. The golden-trace convention uses `<name>-golden.test.ts` placement under `packages/engine/test/integration/` (precedent: `synthetic-decision-fitl-canary-golden.test.ts`, `preview-utility-fitl-golden.test.ts`).
3. Golden fixtures live under `packages/engine/test/fixtures/trace/` per the precedent (`synthetic-decision-fitl-canary-golden.test.ts:19` references `'../../../test/fixtures/trace/synthetic-decision-fitl-canary.json'`).
4. The test class marker convention is `// @test-class: golden-trace` per `.claude/rules/testing.md`.

## Architecture Check

1. **Determinism** (Foundation 8): the test asserts byte-identical projected-margin values across runs, proving the per-option preview pipeline is deterministic.
2. **Engine-agnostic** (Foundation 1): the diagnostic profile lives in `data/games/fire-in-the-lake/` (game-specific data); the test exercises engine-generic preview infrastructure.
3. **Golden-test discipline**: re-blessing requires explicit commit-body acknowledgement (`Re-bless golden trace: <test-file>`) per `.claude/rules/testing.md`.

## What to Change

### 1. Diagnostic FITL profile (or extension)

In `data/games/fire-in-the-lake/`, add or extend a diagnostic profile YAML to opt into `preview.inner.chooseOne: true` and reference `preview.option.delta.victory.currentMargin.self` via a `preferOptionProjectedMargin` microturn-scope consideration. This is test data; it does not touch production profiles.

### 2. Golden fixture

Generate a pinned trace fixture at `packages/engine/test/fixtures/trace/policy-preview-inner-fitl-canary.json` from a known-good run on a fixed seed. Modeled on the existing `synthetic-decision-fitl-canary.json`.

### 3. Golden test

`packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` (new) with:

- Header marker: `// @test-class: golden-trace`
- Loads the GameDef + diagnostic profile + fixed seed.
- Runs the canary, captures the trace, and compares byte-for-byte against the pinned fixture.
- On mismatch, fails with a diagnostic pointing to `Re-bless golden trace:` commit-body convention.

## Files to Touch

- `data/games/fire-in-the-lake/<diagnostic-profile-path>` (new or modify — verify exact path during implementation; this is the diagnostic profile that opts into `preview.inner.chooseOne` for testing)
- `packages/engine/test/fixtures/trace/policy-preview-inner-fitl-canary.json` (new — pinned golden fixture)
- `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` (new — golden test)

## Out of Scope

- Production FITL profile changes — only the diagnostic profile opts in; production profiles remain default-off.
- Cookbook documentation of the consideration — ticket 010.
- Re-blessing protocol — applies only on legitimate spec/implementation shifts; not exercised on first land.

## Acceptance Criteria

### Tests That Must Pass

1. New: golden test loads the diagnostic profile, runs the canary, and matches the pinned fixture byte-for-byte.
2. Existing `pnpm -F @ludoforge/engine test:integration`.
3. Existing `pnpm -F @ludoforge/engine test`.

### Invariants

1. (golden-trace) FITL canary with `preview.inner.chooseOne: true` + `preferOptionProjectedMargin` produces byte-identical projected-margin values across runs (Spec 160 §AC #6).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` (new) — `golden-trace`. Pinned FITL canary with opt-in. Modeled on `packages/engine/test/integration/synthetic-decision-fitl-canary-golden.test.ts`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration`
3. `pnpm -F @ludoforge/engine test`
