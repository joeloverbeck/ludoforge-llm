# 160PEROPTPREV-009: FITL canary golden test for inner preview

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/160PEROPTPREV-005.md`, `archive/tickets/160PEROPTPREV-006.md`, `archive/tickets/160PEROPTPREV-007.md`

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

Implementation note: the diagnostic profile is stored in `data/games/fire-in-the-lake/94-diagnostic-agents.md` and is intentionally not imported by `data/games/fire-in-the-lake.game-spec.md`; the golden test loads it explicitly and overlays it on the compiled FITL fixture so production seat bindings remain unchanged.

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

## Outcome (2026-05-07)

Landed boundary:

- Added `data/games/fire-in-the-lake/94-diagnostic-agents.md` with the unbound `policy-preview-inner-fitl-canary` diagnostic profile. It extends `arvn-evolved`, opts into `preview.inner.chooseOne`, uses `policyGuided` completion, and adds the `preferOptionProjectedMargin` microturn consideration over `preview.option.delta.victory.currentMargin.self`.
- Added `packages/engine/test/fixtures/trace/policy-preview-inner-fitl-canary.json`, pinned from FITL seed `1001` after replaying six existing canary decisions. The pinned govern-mode chooseOne has `aid` projected-margin delta `0` and `patronage` projected-margin delta `1`.
- Added `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` with `// @test-class: golden-trace`. The test loads the diagnostic profile artifact explicitly, overlays it on a cloned FITL GameDef, captures the verbose inner-preview trace excerpt, and compares normalized JSON bytes against the fixture. Its mismatch diagnostic includes the required `Re-bless golden trace:` convention.

Boundary correction:

- The diagnostic profile artifact is not imported into the production FITL entrypoint and does not alter production profile bindings. This satisfies the ticket's diagnostic-profile deliverable while preserving the explicit out-of-scope production-profile boundary.

Touched-file scope:

- Ticket-named diagnostic profile path resolved to `data/games/fire-in-the-lake/94-diagnostic-agents.md`.
- Ticket-named fixture and golden test were added at the requested paths.
- No schema or generated artifact fallout is expected; this is test data plus a test-only overlay.
- New source size check: `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` is 261 lines, within repo guidance.

Final proof ledger:

- `pnpm -F @ludoforge/engine build` — passed after the TypeScript fixes.
- `node --test packages/engine/dist/test/integration/policy-preview-inner-fitl-canary-golden.test.js` — passed; 1 test.
- `pnpm -F @ludoforge/engine test:integration` — passed; 273/273 files.
- `pnpm -F @ludoforge/engine test` — passed; default lane summary 65/65 files.
- `pnpm run check:ticket-deps` — passed; 2 active tickets and 2265 archived tickets checked.

Status/proof transcription note:

- The only post-proof ticket edits were terminal status/proof transcription and this note. No code, scope, acceptance, command, touched-file, follow-up, or dependency change followed the final engine proof lanes.
