# 161CHOOSNINNPREV-010: FITL chooseNStep canary golden trace

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes (test + golden fixture) — `packages/engine/test/integration/`
**Deps**: `archive/tickets/161CHOOSNINNPREV-004.md`

## Problem

Spec 161's per-root-option preview at chooseNStep is intended to differentiate options the same way chooseOne preview did in Spec 160 — by producing distinct projected-margin deltas across legal ADDs. The FITL canary scenario already pins chooseOne behavior via `policy-preview-inner-fitl-canary-golden.test.ts`; the chooseNStep counterpart is needed so a regression in per-root-option ordering, beam continuation, or ref resolution is caught as a golden-trace failure rather than slipping into integration silently.

## Assumption Reassessment (2026-05-07)

1. `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` exists as the chooseOne precedent.
2. ARVN profile (post-Ticket 013) opts into `preview.inner.chooseNStep: true`. For this golden test, an opt-in profile is used unconditionally — the test does not depend on Ticket 013's profile change to be live in production.
3. Golden traces are committed under `packages/engine/test/fixtures/` per project convention (verify exact subpath during implementation; FITL fixtures may live at `packages/engine/test/fixtures/fitl/` or similar).
4. Test class is `golden-trace`; commit-body convention applies for re-blessing per `.claude/rules/testing.md`.

## Architecture Check

1. F#16 — Testing as Proof: correctness is proven by golden tests for chooseNStep per-option preview output.
2. F#8 — the golden trace is the strongest-possible determinism artifact for a specific scenario; pairs with Ticket 008's general replay-identity test (which proves invariance across runs but does not pin the values).
3. Engine-agnostic test fixture — golden trace is FITL data, but the test logic is generic. The runner reuses canonical serialization; no game-specific assertions in test code. F#1 honored.

## What to Change

### 1. New integration test `packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts`

`golden-trace`. Models on `policy-preview-inner-fitl-canary-golden.test.ts`. Asserts:

- A pinned FITL chooseNStep frontier (specific seed, specific ply, specific microturn) produces byte-identical per-option `preview.option.delta.victory.currentMargin.self` values across runs against the committed golden fixture.
- Per-option keys are stable across runs.
- `previewUsage.mode === 'exactWorld'` (or whatever mode applies to the canary's ARVN-like profile).

### 2. Golden fixture

Commit the golden trace alongside the test at the chooseOne precedent's trace-fixture location: `packages/engine/test/fixtures/trace/spec-161-choosenstep-fitl-canary-golden.json`. Capture by running the canary scenario once with `chooseNStep: true` after Ticket 004 lands; serialize canonically.

If the FITL canary's ply/seed combination produces no chooseNStep frontiers (unlikely, but possible), surface via the 1-3-1 rule — propose a different ply or scenario rather than skipping.

## Files to Touch

- `packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts` (new — `golden-trace`)
- `packages/engine/test/fixtures/trace/spec-161-choosenstep-fitl-canary-golden.json` (new — committed golden fixture; path matches chooseOne precedent's trace-fixture location)

## Out of Scope

- Per-option iteration unit tests — Ticket 002.
- Hidden-info propagation — Ticket 007.
- Replay-identity (general invariant, not pinned values) — Ticket 008.
- ARVN profile opt-in — Ticket 013 (separate concern; this golden test uses an opt-in profile fixture inside the test).

## Acceptance Criteria

### Tests That Must Pass

1. New: pinned FITL chooseNStep canary produces byte-identical per-option projected-margin values vs. committed golden.
2. Existing FITL canary golden (`policy-preview-inner-fitl-canary-golden.test.ts`) continues to pass — no regression to chooseOne behavior.
3. Existing engine suite: `pnpm -F @ludoforge/engine test`.
4. Existing integration suite: `pnpm -F @ludoforge/engine test:integration`.

### Invariants

1. (golden-trace) FITL canary with `preview.inner.chooseNStep: true` produces byte-identical per-option projected-margin values across runs. (Spec 161 acceptance #16; invariant #8.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts` (new) — `golden-trace`. Pinned FITL chooseNStep canary with opt-in.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.js`
2. `pnpm -F @ludoforge/engine test:integration`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm -F @ludoforge/engine test`

## Outcome

Completion date: 2026-05-08.

Live reassessment found that the seed-1001 replay used by the existing chooseOne canary reaches ARVN chooseNStep frontiers, but those frontiers produce `readyCount: 0` and `distinctValueCount: 0` for `preview.option.delta.victory.currentMargin.self` because the broad target-space choices hit `unknownDepthCap`. That replay is therefore not the ticket's projected-margin golden witness.

The implemented witness uses FITL seed 1, `maxTurns: 10`, `playerCount: 4`, and decision index 27. That frontier is a chooseNStep ADD for `decision:doc.eventDecks.0.cards.92.unshaded.effects.0.chooseN::$fulbrightPiecesToAvailable`; it produces `previewUsage.mode: "exactWorld"`, `readyCount: 11`, `distinctValueCount: 2`, `min: 3`, `max: 4`, and `utility: "differentiating"` for `preview.option.delta.victory.currentMargin.self`.

The test uses an in-test ARVN-like opt-in profile cloned from `arvn-evolved`, with `preview.inner.chooseNStep: true`, the `preferOptionProjectedMargin` microturn consideration, and `fallbackCompletionPolicy: "greedy"` for continuation fallback. The greedy fallback is part of this diagnostic canary profile only; production ARVN profile opt-in remains out of scope for Ticket 013. This keeps the ticket aligned to F#16 by pinning actual differentiated projected-margin values rather than merely proving that chooseNStep preview was invoked.

Touched-file scope: added `packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts` and `packages/engine/test/fixtures/trace/spec-161-choosenstep-fitl-canary-golden.json`. The originally example `packages/engine/test/fixtures/fitl/...` path was corrected to the existing trace-fixture convention used by `policy-preview-inner-fitl-canary-golden.test.ts`.

Generated fallout: committed golden JSON fixture only; no schema artifacts or generated schema changes are owned.

Deferred sibling scope: structural audit, cookbook, and manual validation remain with Tickets 011-013.

Runtime surface breadth: test/golden only; the proof exercises policy/agent runtime behavior without changing production runtime code.

Command ledger:

- `Test Plan | pnpm -F @ludoforge/engine build && node --test dist/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.js | split into serial build plus repo-root node --test packages/engine/dist/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.js | passed; final focused rerun passed in 41192 ms after build-producing lanes`
- `Acceptance Criteria | existing FITL canary golden policy-preview-inner-fitl-canary-golden.test.ts continues to pass | focused repo-root node --test packages/engine/dist/test/integration/policy-preview-inner-fitl-canary-golden.test.js | passed; final focused rerun passed in 1019 ms after build-producing lanes`
- `Test Plan | pnpm -F @ludoforge/engine test:integration | run literally | passed; 274/274 files passed`
- `Test Plan | pnpm turbo typecheck | run literally | passed; 3/3 tasks successful`
- `Test Plan | pnpm turbo lint | run literally | passed; 2/2 tasks successful`
- `Test Plan | pnpm -F @ludoforge/engine test | run literally | passed; schema artifact check plus 66/66 default files passed`
- `Terminal status | pnpm run check:ticket-deps | run literally after marking COMPLETED | passed for 4 active tickets and 2276 archived tickets`

Output sequencing: proof was run serially because build, typecheck, engine test, and focused compiled tests consume or rewrite `packages/engine/dist`. The focused chooseNStep and chooseOne compiled goldens were rerun after the broad build-producing lanes.
