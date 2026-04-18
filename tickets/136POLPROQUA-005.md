# 136POLPROQUA-005: CI — `POLICY_PROFILE_QUALITY_REGRESSION` annotation + PR comment

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new script `packages/engine/scripts/emit-policy-profile-quality-report.mjs`; modify `.github/workflows/engine-determinism.yml`
**Deps**: `tickets/136POLPROQUA-004.md`

## Problem

Spec 136 Contract §2 mandates that policy-profile-quality regressions "emit a `POLICY_PROFILE_QUALITY_REGRESSION` annotation" naming the profile variant, the seed, and the trajectory delta. Spec 136 Implementation Direction → Tooling goes further: "Add a CI annotation job that reads policy-profile-quality results and posts a PR comment summarizing variant deltas."

Ticket 004 landed the non-blocking job and uploads TAP output as an artifact. This ticket consumes that TAP output, emits GitHub Actions annotations, and posts/updates a PR comment with variant-level convergence deltas. Without this ticket, a failing policy-profile-quality run is invisible to the PR reviewer beyond the red-check badge — the actionable signal ("which variant, which seed, what trajectory did it take?") stays buried in raw TAP logs.

## Assumption Reassessment (2026-04-18)

1. Ticket 004 configured the `policy-profile-quality` job to emit TAP output to `policy-profile-quality-tap.log` and uploads it as the `policy-profile-quality-tap` artifact. This ticket's script consumes that TAP format.
2. Node's built-in TAP output from `node --test` includes per-test pass/fail status, test names (which encode `seed N: variant X reaches terminal within Y moves`), and failure messages (which include `stopReason`, `moves.length`). The script can parse this without additional instrumentation.
3. GitHub Actions annotations are emitted via `::error file=<path>,line=<n>::<message>` or `::warning file=<path>,line=<n>::<message>` written to stdout during a workflow step. For policy-profile-quality regressions, warnings are appropriate (non-blocking).
4. PR comment posting is idiomatic via `actions/github-script@v7` or `gh pr comment` with `--edit-last`. The latter avoids comment spam on repeat runs.
5. The `github-token` available in PR workflows has `pull-requests: write` by default only on pull_request events originating from the same repository. For external-fork PRs, the token is read-only — the annotation emission works but PR comment posting fails gracefully. Handle this case in the script (try/catch; log and continue).
6. The comment format from the spec ("variant `arvn-evolved` convergence rate on canary seeds: 4/5 → 3/5") implies the script compares the current run's convergence count against the latest main-branch baseline. Computing a true delta requires fetching previous runs; for the initial landing, the script can report the current rate (e.g., "arvn-evolved: 4/5 convergence") and leave delta-against-baseline as a follow-up enhancement. Document this scope limit.

## Architecture Check

1. **Single-purpose script**. `emit-policy-profile-quality-report.mjs` parses TAP, emits annotations, and posts a comment. No coupling to the test runner, no coupling to engine internals. If the TAP format changes, only this script needs adjustment.
2. **Engine-agnostic**. The script reads profile-variant IDs and seeds from test names and failure messages — it does not import FITL game definitions or profile data. The variant ID is carried in the test file's `@profile-variant` marker, which the script extracts from the source file path (recoverable from the TAP log's file-level metadata). No game-specific branching.
3. **Graceful degradation**. If the `github-token` lacks `pull-requests: write`, the script logs a warning and continues — annotations still emit, only the comment is skipped. Forks stay supported without security relaxation.
4. **FOUNDATIONS #15 (Architectural Completeness)**. Fixing the observability gap completes the non-blocking CI contract: the signal reaches the reviewer in a form they can act on, not just a raw log. Without this ticket, Ticket 004's non-blocking job is architecturally incomplete.
5. **No new secrets**. Uses the default `GITHUB_TOKEN` provided by Actions; no external services.

## What to Change

### 1. Create `packages/engine/scripts/emit-policy-profile-quality-report.mjs`

Script responsibilities (single file, ~150 lines):

- Read `policy-profile-quality-tap.log` from a path passed via CLI arg (default `./policy-profile-quality-tap.log`).
- Parse TAP output into a structured list: `{ file, variantId, seed, passed, stopReason?, movesLength?, failureMessage? }`.
- For each failed test, emit `::warning file=<test-file>::POLICY_PROFILE_QUALITY_REGRESSION variant=<id> seed=<n> stopReason=<s> moves=<n>` to stdout (GHA annotation format).
- Compute per-variant pass/fail counts: `{ variantId: 'arvn-evolved', converged: 4, total: 5 }`.
- Build a markdown comment body:
  ```
  ## Policy-Profile Quality Report

  | Variant | Convergence | Notes |
  |---|---|---|
  | all-baselines | 5/5 |  |
  | arvn-evolved | 4/5 | seed 2046 did not converge (stopReason=maxTurns, moves=300) |

  _Non-blocking signal per Spec 136. Determinism corpus is the blocking gate._
  ```
- If `process.env.GITHUB_EVENT_NAME === 'pull_request'`, attempt to post or update a sticky PR comment via `gh pr comment --edit-last` (installing/using the `gh` CLI that's preinstalled in `ubuntu-latest`). Catch errors and log; do not fail the step.

Arguments:
- `--input <path>` (default `./policy-profile-quality-tap.log`)
- `--pr-comment` (boolean flag to enable comment posting; default true in PR context, false otherwise)

### 2. Wire the script into `engine-determinism.yml`

In the `policy-profile-quality` job from Ticket 004, add a step after the `test:policy-profile-quality` step (and before the artifact upload, or after — either order works since the script reads the same file):

```yaml
      - name: Emit policy-profile-quality annotations and PR comment
        if: always()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node packages/engine/scripts/emit-policy-profile-quality-report.mjs --input policy-profile-quality-tap.log
```

The `if: always()` ensures annotations emit even when the test step exited non-zero.

### 3. Unit test for the TAP parser

Add `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts`:

- Fixture TAP strings encoding (a) all-passing variant, (b) one-failing-seed variant, (c) both-variants-mixed results.
- Assert the parser output shape per fixture.
- Assert the annotation string format matches the `::warning file=...::POLICY_PROFILE_QUALITY_REGRESSION ...` shape.
- Assert the markdown comment body per fixture.

This test imports from the script (the script must `export` its parsing and formatting functions; the `main()` entry point stays as a bottom-of-file side-effect call gated by `import.meta.url === ...`).

### 4. Marker for the new test file

The new infrastructure test carries `// @test-class: architectural-invariant` (no witness needed — it's an invariant that the report format and parser behavior stay stable).

## Files to Touch

- `packages/engine/scripts/emit-policy-profile-quality-report.mjs` (new)
- `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts` (new)
- `.github/workflows/engine-determinism.yml` (modify — add one step to the `policy-profile-quality` job)

## Out of Scope

- Delta computation against the main-branch baseline (current run only — baseline deltas are a future enhancement).
- Multi-run trend tracking (e.g., storing historical convergence rates). Out per Spec 136 Non-Goals ("No new statistical harness").
- Runner-visible profile evaluation.
- Annotation for non-FITL games. This ticket's script reads FITL-style test names; cross-game extension is a future ticket if/when Texas Hold'em gets a policy-profile-quality corpus.
- Modifying the determinism job's output format.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit` — including the new `emit-policy-profile-quality-report.test.ts` parser tests.
2. On a PR with an intentional policy-profile-quality regression, a `::warning` annotation appears in the workflow run log (verified in the Actions UI) and a PR comment lists the failing variant/seed.
3. On a PR without regressions, no annotation is emitted and the PR comment shows "all-baselines: 5/5, arvn-evolved: 5/5".
4. On an external-fork PR (which lacks `pull-requests: write`), the annotation still emits and the script logs a warning about skipping the comment — the workflow step exits 0.
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — no regressions.

### Invariants

1. The annotation format is `POLICY_PROFILE_QUALITY_REGRESSION variant=<id> seed=<n> stopReason=<s> moves=<n>` — exact string per Spec 136 Contract §2.
2. The annotation severity is `warning`, never `error` (errors block the PR; warnings do not).
3. The PR comment uses `gh pr comment --edit-last` to avoid comment-spam on re-runs of the same PR.
4. The script exits 0 even when policy-profile-quality tests failed — the non-blocking contract is preserved at the script level as well as the job level.
5. No game-specific data, profile IDs, or seed lists are hardcoded in the script — all data flows from the TAP log.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts` — new. Rationale: locks the TAP-parse + annotation-format + comment-format contract as an architectural invariant. Changes to the output shape would break downstream consumers (reviewer expectations, potential future aggregators).

### Commands

1. Local dry-run with a fixture TAP log: `node packages/engine/scripts/emit-policy-profile-quality-report.mjs --input test/fixtures/sample-policy-profile-quality-tap.log` — verify stdout contains annotations and a markdown body.
2. `pnpm -F @ludoforge/engine test:unit` — includes parser test.
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — full-suite.
4. `pnpm run check:ticket-deps` — dependency integrity.
5. Open a PR, verify annotations appear in the Actions UI and a sticky comment is posted (or edited on re-run).
