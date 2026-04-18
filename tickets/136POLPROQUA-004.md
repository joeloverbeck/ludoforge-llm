# 136POLPROQUA-004: CI — non-blocking `policy-profile-quality` job in `engine-determinism.yml`

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — CI workflow only (`.github/workflows/engine-determinism.yml`)
**Deps**: `archive/tickets/136POLPROQUA-002.md`

## Problem

Spec 136 Contract §2 requires that `policy-profile-quality/` test failures emit a `POLICY_PROFILE_QUALITY_REGRESSION` annotation but do not block CI, while `determinism/` failures remain blocking. Spec 136 Required Proof → CI integration is explicit: "A separate blocking-gate job runs only `determinism/` (extending the existing `engine-determinism.yml` lane)."

Ticket 002 adds a `test:policy-profile-quality` script and a `policy-profile-quality` lane in the test runner. This ticket adds a second GitHub Actions job to the existing `engine-determinism.yml` workflow that runs that lane with `continue-on-error: true`, preserving the blocking determinism gate while letting policy-profile-quality signal quality regressions without red-gating merges.

## Assumption Reassessment (2026-04-18)

1. `.github/workflows/engine-determinism.yml` currently declares a single `determinism` job on `ubuntu-latest` that runs `pnpm -F @ludoforge/engine test:determinism`. Its triggers cover pushes and PRs against `main` on paths `packages/engine/src/{kernel,sim,agents}/**`, `packages/engine/test/determinism/**`, and `data/games/**` (lines 5–19). This ticket extends the workflow rather than creating a sibling file, matching Spec 136's directive.
2. The existing `determinism` job has no `continue-on-error` flag, so it blocks merges today. This ticket must not relax that behavior — it adds a second job with the non-blocking flag while leaving the first job's policy unchanged.
3. `test:policy-profile-quality` (added by Ticket 002) will exist as a script in `packages/engine/package.json` before this ticket lands. The script invokes `node scripts/run-tests.mjs --lane policy-profile-quality`.
4. GitHub's `continue-on-error: true` at the job level makes a failed job non-blocking for the required-checks gate but still displays a red check in the PR UI. That matches Spec 136's "CI annotates the PR with a quality delta but the check passes" semantics.
5. Ticket 005 (next in chain) depends on this job existing and on its test output being captured — this ticket must upload test output as an artifact or stream it in a format Ticket 005 can parse.

## Architecture Check

1. **Single workflow, two jobs — preserves separation of concerns**. The blocking determinism gate and the non-blocking quality lane share the same trigger paths but have distinct failure semantics. Co-locating them in `engine-determinism.yml` (per Spec 136) signals to reviewers that they are sibling lanes, not unrelated pipelines.
2. **No cross-job dependencies**. The `policy-profile-quality` job does NOT `needs: determinism` — that would cascade blocking behavior. The two jobs run in parallel on the same runner matrix.
3. **Additive triggers**. The new job's path filters add `packages/engine/test/policy-profile-quality/**` to the existing trigger set (both push and pull_request). Touching any of the existing paths OR the new path runs both jobs.
4. **FOUNDATIONS #14**. No alias workflow, no duplicated determinism job — this is an extension, not a rewrite.

## What to Change

### 1. Extend `.github/workflows/engine-determinism.yml`

Add `packages/engine/test/policy-profile-quality/**` to both the `push.paths` and `pull_request.paths` lists (two additions total).

Add a second job below `determinism`:

```yaml
  policy-profile-quality:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    continue-on-error: true
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F @ludoforge/engine build
      - name: Run policy-profile-quality lane
        id: policy-profile-quality-run
        run: pnpm -F @ludoforge/engine test:policy-profile-quality --test-reporter=tap --test-reporter-destination=policy-profile-quality-tap.log
        continue-on-error: true
      - name: Upload TAP log for annotation job
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: policy-profile-quality-tap
          path: policy-profile-quality-tap.log
          retention-days: 7
```

Verify the `--test-reporter` flag syntax against the current Node version (v22). If the engine's `run-tests.mjs` does not already forward reporter flags, Ticket 005 may need to adjust that — capture the observation in the Ticket 005 prerequisites. For this ticket, logging to `policy-profile-quality-tap.log` via shell redirect (`| tee`) is an acceptable fallback.

### 2. Update repo's required-checks configuration (advisory)

Document in the ticket outcome that the `policy-profile-quality` check should NOT be added to branch protection's required-status list. If branch protection already enumerates `Engine Determinism Parity / determinism` as required, that entry is unchanged; the new `policy-profile-quality` check appears in the PR UI but is not required. No actual settings change within this ticket — branch protection is a repo-settings concern, not a workflow-file concern. Flag it to the user if they want to verify the setting during ticket review.

## Files to Touch

- `.github/workflows/engine-determinism.yml` (modify)

## Out of Scope

- The annotation / PR comment script — Ticket 005.
- Creating a separate workflow file. Spec 136 explicitly directs extending the existing one.
- Changing the `determinism` job's `continue-on-error` policy (remains blocking).
- Changing the engine package, source code, or test files.
- Changing branch-protection settings — if required, raise as a follow-up after merge.

## Acceptance Criteria

### Tests That Must Pass

1. On a PR that does not touch the policy-profile-quality corpus, the new `policy-profile-quality` job still runs (path filters include the canary triggers) and passes when local verification passes — green check.
2. On a PR that introduces an intentional convergence failure in a policy-profile-quality test, the `policy-profile-quality` job shows red but the overall PR check status remains passable (determinism gate stays green → merge-able).
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — no regressions.
4. `pnpm run check:ticket-deps` — dependency integrity.

### Invariants

1. The `determinism` job in `engine-determinism.yml` continues to block on failure — its `continue-on-error` is unset (default false).
2. The `policy-profile-quality` job runs `pnpm -F @ludoforge/engine test:policy-profile-quality` and no other lane; it MUST NOT subsume or replace the determinism lane.
3. The two jobs are siblings with no `needs` dependency between them.
4. Path triggers are additive — all paths that previously triggered the `determinism` job still trigger the workflow; the new `policy-profile-quality/**` path additionally triggers it.
5. TAP output artifact is retained for ≥7 days so Ticket 005's annotation step can consume it.

## Test Plan

### New/Modified Tests

No engine-code test changes. Workflow changes are verified via GitHub's Actions UI on a test branch.

### Commands

1. Local dry-run: `pnpm -F @ludoforge/engine test:policy-profile-quality` (verifies the script referenced by the workflow works).
2. `act -j policy-profile-quality` (optional, if `act` is installed — validates workflow syntax locally).
3. `pnpm run check:ticket-deps` — dependency integrity.
4. Push to a feature branch, open a PR, observe:
   - Both `determinism` and `policy-profile-quality` jobs run.
   - `policy-profile-quality` job uploads `policy-profile-quality-tap` artifact.
   - Determinism stays blocking; policy-profile-quality is advisory.
