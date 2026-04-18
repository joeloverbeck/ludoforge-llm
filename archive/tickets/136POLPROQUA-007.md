# 136POLPROQUA-007: CI — compare policy-profile-quality report against main-branch baseline

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — report script / workflow comparison logic
**Deps**: `archive/tickets/136POLPROQUA-005.md`, `specs/136-policy-profile-quality-corpus.md`

## Problem

Ticket 005 landed non-blocking policy-profile-quality annotations plus a sticky PR comment, but the comment reports only the current run's convergence totals. Spec 136's tooling contract calls for variant deltas against the latest main-branch baseline, so reviewers can immediately see whether a profile regressed or improved rather than manually comparing raw rates across runs.

Without that delta surface, the PR comment is useful but incomplete: it answers "what happened on this run?" but not "what changed relative to main?"

## Assumption Reassessment (2026-04-18)

1. `packages/engine/scripts/emit-policy-profile-quality-report.mjs` currently consumes a single NDJSON report and formats only current-run per-variant totals plus failing-seed notes.
2. `.github/workflows/engine-determinism.yml` currently generates the report only for the PR or push under test; it does not fetch or materialize a comparable main-branch baseline artifact.
3. Ticket 005 truthfully narrowed scope during implementation: current-run reporting landed, delta-against-main did not. This ticket owns that remainder explicitly.

## Architecture Check

1. Delta computation belongs in the same report-generation boundary as the current annotation/comment formatting, because both consume the same structured witness surface and should stay synchronized.
2. The comparison must remain engine-agnostic: compare generic `{ variantId, seed, passed, stopReason, moves }` report rows, not FITL-specific internals.
3. The workflow should materialize baseline evidence explicitly rather than hardcoding historical expectations into the script or tests.

## What to Change

### 1. Add baseline comparison support to the policy-profile-quality report flow

Extend the report-generation path so the script can accept both the current PR run and a comparable main-branch baseline, then emit per-variant `before -> after` convergence summaries in the sticky comment.

### 2. Materialize a main-branch baseline in CI

Update the workflow so the `policy-profile-quality` job, or a tightly-related helper step/job, can obtain the latest main-branch baseline report in a way that works for repo PRs without changing the lane's non-blocking semantics.

### 3. Lock the delta formatting contract

Add or extend unit coverage so the comment shape is stable for improved, unchanged, and regressed variants.

## Files to Touch

- `packages/engine/scripts/emit-policy-profile-quality-report.mjs` (modify)
- `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts` (modify)
- `.github/workflows/engine-determinism.yml` (modify)

## Out of Scope

- Replacing the non-blocking policy-profile-quality lane with a blocking gate.
- Adding long-term statistical storage outside the baseline-vs-current comparison needed for PR review.
- Changing the witness corpus itself.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit`
2. On a repo PR with a policy-profile-quality regression, the sticky PR comment shows a per-variant delta such as `3/3 -> 2/3`.
3. On a repo PR with no regression, the sticky PR comment still shows the current rate and its unchanged baseline.
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
5. `pnpm run check:ticket-deps`

### Invariants

1. Annotation severity remains `warning`, not `error`.
2. Delta computation compares explicit report artifacts rather than hardcoded expected totals.
3. PR-comment updates remain sticky and non-spamming.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts` — extend to cover delta formatting for unchanged, improved, and regressed variant summaries.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-04-18
- Added baseline-input support to `packages/engine/scripts/emit-policy-profile-quality-report.mjs`, so the sticky PR comment now renders per-variant convergence deltas in `before -> after` form when a main-branch baseline report is available.
- Extended `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts` to lock the delta-comment contract for current-only, unchanged, and regressed-variant cases.
- Updated `.github/workflows/engine-determinism.yml` so the `policy-profile-quality` job downloads the latest successful `main` artifact for the same workflow on repo PRs, and passes that baseline report into the comment-generation step when present.
- verification set: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test:unit`, local dual-input dry run of `node scripts/emit-policy-profile-quality-report.mjs --input <current> --baseline-input <baseline> --no-pr-comment`, `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`, `pnpm run check:ticket-deps`
- proof gaps: live GitHub Actions baseline-download behavior and PR-comment rendering remain first-run CI observations rather than local proof.
