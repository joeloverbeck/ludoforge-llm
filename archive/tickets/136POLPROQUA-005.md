# 136POLPROQUA-005: CI — `POLICY_PROFILE_QUALITY_REGRESSION` annotation + PR comment

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new script `packages/engine/scripts/emit-policy-profile-quality-report.mjs`; modify `.github/workflows/engine-determinism.yml`
**Deps**: `archive/tickets/136POLPROQUA-004.md`

## Problem

Spec 136 Contract §2 mandates that policy-profile-quality regressions "emit a `POLICY_PROFILE_QUALITY_REGRESSION` annotation" naming the profile variant, the seed, and the trajectory delta. Spec 136 Implementation Direction → Tooling goes further: "Add a CI annotation job that reads policy-profile-quality results and posts a PR comment summarizing variant deltas."

Ticket 004 landed the non-blocking job and uploads the captured lane log as an artifact. This ticket consumes that log, emits GitHub Actions annotations, and posts/updates a PR comment with variant-level convergence deltas. Without this ticket, a failing policy-profile-quality run is invisible to the PR reviewer beyond the red-check badge — the actionable signal ("which variant, which seed, what trajectory did it take?") stays buried in the raw job log.

## Assumption Reassessment (2026-04-18)

1. Ticket 004 captures the `policy-profile-quality` lane's stdout/stderr stream into `policy-profile-quality.log` and uploads it as the `policy-profile-quality-log` artifact. This ticket's script consumes that captured lane log.
2. Live Node reporter check: the captured lane log is sufficient for file-level pass/fail only, not for seed-level failure detail. To satisfy the spec's `variant=<id> seed=<n> stopReason=<s> moves=<n>` annotation contract, this ticket must widen the lane output surface slightly by having policy-profile-quality tests emit a structured NDJSON report when `ENGINE_POLICY_PROFILE_QUALITY_REPORT_PATH` is set.
3. GitHub Actions annotations are emitted via `::error file=<path>,line=<n>::<message>` or `::warning file=<path>,line=<n>::<message>` written to stdout during a workflow step. For policy-profile-quality regressions, warnings are appropriate (non-blocking).
4. PR comment posting is idiomatic via `actions/github-script@v7` or `gh pr comment` with `--edit-last`. The latter avoids comment spam on repeat runs.
5. The `github-token` available in PR workflows has `pull-requests: write` by default only on pull_request events originating from the same repository. For external-fork PRs, the token is read-only — the annotation emission works but PR comment posting fails gracefully. Handle this case in the script (try/catch; log and continue).
6. The comment format from the spec ("variant `arvn-evolved` convergence rate on canary seeds: 4/5 → 3/5") implies the script compares the current run's convergence count against the latest main-branch baseline. Computing a true delta requires fetching previous runs; for the initial landing, the script can report the current rate (e.g., "arvn-evolved: 4/5 convergence") and leave delta-against-baseline as a follow-up enhancement. Document this scope limit.

## Architecture Check

1. **Single-purpose script**. `emit-policy-profile-quality-report.mjs` parses the structured policy-profile-quality report, emits annotations, and posts a comment. No coupling to engine internals beyond the report schema. If the report format changes, only this script and its unit tests need adjustment.
2. **Engine-agnostic**. The report carries variant IDs, seeds, stop reasons, and move counts directly from the witness tests. The script does not import FITL game definitions or profile data; it consumes the generic report surface plus repo-owned file paths.
3. **Graceful degradation**. If the `github-token` lacks `pull-requests: write`, the script logs a warning and continues — annotations still emit, only the comment is skipped. Forks stay supported without security relaxation.
4. **FOUNDATIONS #15 (Architectural Completeness)**. Fixing the observability gap completes the non-blocking CI contract: the signal reaches the reviewer in a form they can act on, not just a raw log. Without this ticket, Ticket 004's non-blocking job is architecturally incomplete.
5. **No new secrets**. Uses the default `GITHUB_TOKEN` provided by Actions; no external services.

## What to Change

### 1. Create `packages/engine/scripts/emit-policy-profile-quality-report.mjs`

Script responsibilities (single file, ~150 lines):

- Read `policy-profile-quality-report.ndjson` from a path passed via CLI arg (default `./policy-profile-quality-report.ndjson`).
- Parse the structured report into a list of `{ file, variantId, seed, passed, stopReason, moves }` records.
- For each failed test, emit `::warning file=<test-file>::POLICY_PROFILE_QUALITY_REGRESSION variant=<id> seed=<n> stopReason=<s> moves=<n>` to stdout (GHA annotation format).
- Compute per-variant pass/fail counts: `{ variantId: 'arvn-evolved', converged: 4, total: 5 }`.
- Build a markdown comment body:
  ```
  ## Policy-Profile Quality Report

  | Variant | Convergence | Notes |
  |---|---|---|
  | all-baselines | 3/3 |  |
  | arvn-evolved | 2/3 | seed 1049 did not converge (stopReason=maxTurns, moves=300) |

  _Non-blocking signal per Spec 136. Determinism corpus is the blocking gate._
  ```
- If `process.env.GITHUB_EVENT_NAME === 'pull_request'`, attempt to post or update a sticky PR comment via `gh pr comment --edit-last` (installing/using the `gh` CLI that's preinstalled in `ubuntu-latest`). Catch errors and log; do not fail the step.

Arguments:
- `--input <path>` (default `./policy-profile-quality-report.ndjson`)
- `--pr-comment` (boolean flag to enable comment posting; default true in PR context, false otherwise)

### 2. Wire the script into `engine-determinism.yml`

In the `policy-profile-quality` job from Ticket 004:

- set `ENGINE_POLICY_PROFILE_QUALITY_REPORT_PATH=policy-profile-quality-report.ndjson` on the `test:policy-profile-quality` step so the witness tests emit structured result records
- add a step after the test step (and before the artifact upload, or after — either order works since the script reads the generated report file)

```yaml
      - name: Run policy-profile-quality lane
        env:
          ENGINE_POLICY_PROFILE_QUALITY_REPORT_PATH: policy-profile-quality-report.ndjson
        run: pnpm -F @ludoforge/engine test:policy-profile-quality 2>&1 | tee policy-profile-quality.log
      - name: Emit policy-profile-quality annotations and PR comment
        if: always()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node packages/engine/scripts/emit-policy-profile-quality-report.mjs --input policy-profile-quality-report.ndjson
```

The `if: always()` ensures annotations emit even when the test step exited non-zero.

### 3. Unit test for the report parser

Add `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts`:

- Fixture NDJSON report strings encoding (a) all-passing variant, (b) one-failing-seed variant, (c) both-variants-mixed results.
- Assert the parser output shape per fixture.
- Assert the annotation string format matches the `::warning file=...::POLICY_PROFILE_QUALITY_REGRESSION ...` shape.
- Assert the markdown comment body per fixture.

This test imports from the script (the script must `export` its parsing and formatting functions; the `main()` entry point stays as a bottom-of-file side-effect call gated by `import.meta.url === ...`).

### 4. Structured report emitter for witness tests

Add a small helper under `packages/engine/test/helpers/` that appends NDJSON records when `ENGINE_POLICY_PROFILE_QUALITY_REPORT_PATH` is set. The two policy-profile-quality witness files call that helper after each seed run and before asserting `stopReason === 'terminal'`, so both passing and failing seeds are captured for the workflow report without changing their proof semantics.

### 5. Marker for the new test file

The new infrastructure test carries `// @test-class: architectural-invariant` (no witness needed — it's an invariant that the report format and parser behavior stay stable).

## Files to Touch

- `packages/engine/scripts/emit-policy-profile-quality-report.mjs` (new)
- `packages/engine/test/helpers/policy-profile-quality-report-helpers.ts` (new)
- `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` (modify)
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
3. On a PR without regressions, no annotation is emitted and the PR comment reflects the current witness corpus totals, presently `all-baselines | 3/3` and `arvn-evolved | 3/3`.
4. On an external-fork PR (which lacks `pull-requests: write`), the annotation still emits and the script logs a warning about skipping the comment — the workflow step exits 0.
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — no regressions.

### Invariants

1. The annotation format is `POLICY_PROFILE_QUALITY_REGRESSION variant=<id> seed=<n> stopReason=<s> moves=<n>` — exact string per Spec 136 Contract §2.
2. The annotation severity is `warning`, never `error` (errors block the PR; warnings do not).
3. The PR comment uses `gh pr comment --edit-last` to avoid comment-spam on re-runs of the same PR.
4. The script exits 0 even when policy-profile-quality tests failed — the non-blocking contract is preserved at the script level as well as the job level.
5. No game-specific data, profile IDs, or seed lists are hardcoded in the script — all data flows from the structured report emitted by the witness tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts` — new. Rationale: locks the report-parse + annotation-format + comment-format contract as an architectural invariant. Changes to the output shape would break downstream consumers (reviewer expectations, potential future aggregators).

### Commands

1. Local dry-run with fixture NDJSON: `node packages/engine/scripts/emit-policy-profile-quality-report.mjs --input test/fixtures/sample-policy-profile-quality-report.ndjson` — verify stdout contains annotations and a markdown body.
2. `pnpm -F @ludoforge/engine test:unit` — includes parser test.
3. `pnpm -F @ludoforge/engine test:policy-profile-quality` — verifies the witness lane still passes with the structured emitter wired in.
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — full-suite.
5. `pnpm run check:ticket-deps` — dependency integrity.
6. Open a PR, verify annotations appear in the Actions UI and a sticky comment is posted (or edited on re-run).

## Outcome

- Completion date: 2026-04-18
- `ticket corrections applied`: `captured lane log alone is sufficient for seed-level annotation parsing` -> `policy-profile-quality tests emit a structured NDJSON report when requested, and the workflow comment/annotation step consumes that report`, because live Node test reporter output only preserved file-level failure data under the current lane setup.
- Added `packages/engine/scripts/emit-policy-profile-quality-report.mjs` with exported parse/annotation/comment helpers plus a CLI entrypoint that emits `POLICY_PROFILE_QUALITY_REGRESSION` warnings and posts or updates a sticky PR comment through `gh pr comment --edit-last --create-if-none`.
- Added `packages/engine/test/helpers/policy-profile-quality-report-helpers.ts` and wired both policy-profile-quality witness files to append structured per-seed records before asserting `stopReason === 'terminal'`, so the workflow retains seed-level failure detail without changing the proof semantics of the witness corpus.
- Extended `.github/workflows/engine-determinism.yml` so the `policy-profile-quality` job sets `ENGINE_POLICY_PROFILE_QUALITY_REPORT_PATH=policy-profile-quality-report.ndjson`, runs the report script under `if: always()`, and uploads both the human-readable log and the NDJSON report inside the existing `policy-profile-quality-log` artifact.
- Added parser/formatter unit coverage in `packages/engine/test/unit/infrastructure/emit-policy-profile-quality-report.test.ts`.
- verification set: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test:unit`, `ENGINE_POLICY_PROFILE_QUALITY_REPORT_PATH=/tmp/policy-profile-quality-report.ndjson pnpm -F @ludoforge/engine test:policy-profile-quality`, `node scripts/emit-policy-profile-quality-report.mjs --input /tmp/policy-profile-quality-report.ndjson --no-pr-comment`, `pnpm run check:ticket-deps`, `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`
- baseline-delta-against-main did not land in this ticket; the shipped comment reports current-run convergence only. Follow-up ownership: `tickets/136POLPROQUA-007.md`.
- proof gaps: local parser/script proof is green; live GitHub Actions annotations, sticky PR comments, and external-fork token behavior remain first-run CI observations rather than local proof.
