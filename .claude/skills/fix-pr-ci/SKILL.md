---
name: fix-pr-ci
description: "Diagnose, reproduce, fix, and push solutions for failing or timing-out workflow lanes on a GitHub PR. Triages all failing checks, clusters them by root cause, presents a unified diagnosis (gate 1), applies approved fixes, verifies every affected lane passes locally, then pushes (gate 2). All proposed fixes are validated against docs/FOUNDATIONS.md. Use after pushing a branch and creating a PR when CI reports failing or timing-out lanes."
user-invocable: true
arguments:
  - name: pr_number
    description: "Optional PR number (e.g., 147). If omitted, auto-detect the PR for the current branch via `gh pr view`."
    required: false
---

# Fix PR CI

Systematically recover a PR's failing or timing-out CI lanes. Identify all failing checks, cluster them by suspected root cause, propose fixes that align with `docs/FOUNDATIONS.md`, apply them, verify every non-advisory lane passes locally, then push. Two explicit user gates protect against premature edits and premature push.

## Invocation

```
/fix-pr-ci [PR_NUMBER]
```

**Arguments** (optional, positional):
- `[PR_NUMBER]` — PR number to recover. If omitted, auto-detect via `gh pr view --json number,headRefName` for the current branch. If the current branch is not a PR head, abort with a message asking for an explicit PR number or a checkout of the PR branch.

## Worktree Awareness

If invoked inside a worktree (e.g., `.claude/worktrees/<name>/`), **all file paths and shell commands** in this skill — reads, edits, globs, greps, `pnpm` invocations, `gh` invocations, `git` invocations — must use the worktree root as the working directory. The default working directory is the main repo root; commands without an explicit worktree path will silently operate on main, not the worktree. This applies to every command and path reference below.

## Process

Follow these steps in order. Do not skip any step.

### Step 1: Identify PR & Fetch Failing Checks

1. **Resolve the PR**.
   - If `[PR_NUMBER]` was provided: `gh pr view <N> --json number,headRefName,headRepository,statusCheckRollup,isCrossRepository`.
   - If omitted: `gh pr view --json number,headRefName,headRepository,statusCheckRollup,isCrossRepository` (auto-detects from current branch). If this fails, abort and ask the user for a PR number.

2. **Verify HEAD matches the PR head branch**.
   - Compare `git rev-parse --abbrev-ref HEAD` with the PR's `headRefName`. If they differ, abort and ask the user to check out the PR branch first. The skill must NOT operate on the wrong branch.

3. **Detect cross-repository / fork PRs**.
   - If `isCrossRepository: true`, halt at gate 1 (Step 4) before any push. Pushing to a fork requires write access not assumed by this skill — flag for the user to push manually or grant access.

4. **Enumerate failing & timing-out checks**.
   - `gh pr checks <N>` for the rollup status.
   - `gh run list --branch <headRefName> --limit 20 --json databaseId,name,status,conclusion,headSha,workflowName,jobs` to map check names to run IDs.
   - For each failed/cancelled run, identify its specific failed jobs. Cancelled jobs whose log ends mid-step or whose duration is at the workflow's `timeout-minutes` budget are **timeouts**, not generic failures — classify accordingly in Step 3.

5. **Download failed logs**.
   - For each failed run/job: `gh run view <run-id> --log-failed > /tmp/ci-fix-<run-id>.log`.
   - For determinism / policy-profile-quality lanes that upload artifacts: `gh run download <run-id> -n <artifact-name> -D /tmp/ci-fix-artifacts/` to inspect shard-specific output (e.g., `policy-profile-quality-shard-<id>` artifacts).

Record what was found: list of (check-name, run-id, job-name, conclusion, duration, log-path) tuples for use in subsequent steps.

### Step 2: Build Lane→Command Lookup

For each failing job, derive the local reproduction command. The workflow YAML is the authoritative source — when in doubt, read it.

**Known lanes** (canonical mapping; update this list when workflows change):

| Workflow | Job / Lane | Local repro |
|----------|------------|-------------|
| `ci.yml` | `ci` (lint step)       | `pnpm turbo lint` |
| `ci.yml` | `ci` (typecheck step)  | `pnpm turbo typecheck` |
| `ci.yml` | `ci` (build step)      | `pnpm turbo build` |
| `ci.yml` | `ci` (test step)       | `pnpm turbo test` |
| `ci.yml` | `node-compat` (build only, Node 20) | `nvm use 20 && pnpm install --frozen-lockfile && pnpm turbo build` (advisory; `continue-on-error: true`) |
| `engine-tests.yml` | `build`                                | `pnpm -F @ludoforge/engine build` |
| `engine-tests.yml` | `test (fitl-events)`                   | `pnpm -F @ludoforge/engine test:integration:fitl-events` |
| `engine-tests.yml` | `test (fitl-rules)`                    | `pnpm -F @ludoforge/engine test:integration:fitl-rules` |
| `engine-tests.yml` | `test (texas-cross-game)`              | `pnpm -F @ludoforge/engine test:integration:texas-cross-game` |
| `engine-tests.yml` | `test (slow-parity)`                   | `pnpm -F @ludoforge/engine test:integration:slow-parity` |
| `engine-tests.yml` | `test (e2e-all)`                       | `pnpm -F @ludoforge/engine test:e2e:all` |
| `engine-tests.yml` | `test (memory)`                        | `pnpm -F @ludoforge/engine test:memory` |
| `engine-tests.yml` | `test (performance)`                   | `pnpm -F @ludoforge/engine test:performance` |
| `engine-determinism.yml` | `determinism (<shard>)`        | `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane determinism <shard test_paths from yaml>` |
| `engine-determinism.yml` | `policy-profile-quality (<shard>)` | `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane policy-profile-quality <shard test_paths from yaml>` (advisory; `continue-on-error: true`) |
| `engine-determinism.yml` | `policy-profile-quality-report` | Aggregation job; failures usually downstream of shard failures — fix shards first, then re-evaluate. |

**Unknown lanes**: read the relevant `.github/workflows/*.yml`, locate the job by name, and extract the run command from the matrix entry. Treat the YAML as the source of truth — never rely on stale skill-internal mappings.

For determinism shards, the test paths for each shard are listed in `engine-determinism.yml` under `matrix.include`. Locate the shard by `shard_id` and copy the `test_paths` block verbatim.

### Step 3: Triage & Cluster

Classify each failure and cluster lanes by suspected root cause. One root cause often fans out to multiple lanes — diagnose the cause once per cluster, not once per lane.

**Failure classes**:
- `lint` — ESLint errors. Usually quick: unused imports, unsafe types, formatting.
- `typecheck` — TypeScript errors. FOUNDATIONS F2 (Spec/Schema Synchronization) is a frequent culprit when types and schemas have drifted.
- `build` — `tsc` or `vite` build failure. Usually downstream of typecheck or import-path drift.
- `test-lane` — assertion failures within an integration / e2e / memory / performance lane.
- `determinism-shard` — replay-identity, Zobrist parity, or runtime-parity break. **High stakes** — FOUNDATIONS F1 (Determinism). Treat as critical.
- `policy-profile-quality` — quality regression on an evolved profile. Advisory (continue-on-error).
- `node-compat` — Node 20 build failure. Advisory (continue-on-error).
- `timeout` — job hit `timeout-minutes`. Sub-classify (see below).
- `flake-suspect` — log pattern suggests non-determinism (intermittent assertions, race-like timing). Verify before proposing fixes.
- `advisory` — `continue-on-error: true` lane. Non-blocking; surface but don't block.

**Timeout sub-classification**:
- `(a) infinite loop / hang` — log shows progress stopped mid-test; reproduce locally with `timeout <budget>m <command>` and confirm the same hang.
- `(b) genuine slowness past budget` — log shows steady progress but doesn't finish; local repro completes within (or just past) budget without other issues.
- `(c) external / network` — log shows network/DNS/registry errors; not a code defect. Surface for the user to retry CI rather than "fix".

**Flake-suspect protocol**:
- Re-run the failing lane locally **3 times** in sequence: `for i in 1 2 3; do <repro-command> || break; done`.
- If all three pass: classify as `flake-suspect` and surface at gate 1 — the user decides whether to chase the non-determinism, retry CI, or skip.
- If any fail: treat as a real failure and proceed with diagnosis.

**Clustering heuristics**:
- Same file referenced in multiple stack traces → likely shared root cause.
- Same recently modified module (per `git log` on the PR branch) implicated by multiple lanes → likely cluster.
- Lint/typecheck/build failures often cluster together as one cause.
- Multiple determinism shards failing → almost always one cause (look at the recent commits touching `kernel/`, `sim/`, `agents/`).

For each cluster, identify:
- Cluster name (1–3 words).
- Lanes in the cluster.
- Suspected root cause (one sentence).
- Implicated files (validated against the codebase, not assumed).
- Proposed fix (one paragraph max).
- FOUNDATIONS principles touched (validated against `docs/FOUNDATIONS.md`).

### Step 4: Present Diagnosis & Proposed Fixes — GATE 1

Read `docs/FOUNDATIONS.md` if not already read in this session. Validate every proposed fix against it.

**If any proposed fix would violate FOUNDATIONS**: HARD HALT. Do not present the fix as approvable. Apply the 1-3-1 rule: state the conflict (1 problem), give 3 alternative options (e.g., redesign, defer with ticket, escalate the Foundation principle), and 1 recommendation. Do not proceed until the user resolves the conflict.

Otherwise, present the diagnosis as a structured table:

```
## PR #<N>: CI Failure Diagnosis

### Clusters

| Cluster | Lanes | Class | Root Cause | Proposed Fix | Foundations | Priority |
|---------|-------|-------|------------|--------------|-------------|----------|
| <name>  | <lanes> | <class> | <one-line> | <one-paragraph> | <F1, F2, ...> | HIGH/MED/LOW |

### Lane-by-lane detail

#### Lane: <check-name> (run <run-id>)
- Class: <failure-class>
- Local repro: `<command>`
- Cluster: <cluster-name>
- Evidence (log excerpt, stack trace, or relevant artifact lines): ...

(repeat per lane)

### Advisory lanes (continue-on-error; non-blocking)
1. <lane> — <one-line summary>. Fix at gate 1 is OPT-IN.

### Suspected flakes (verified by 3x local re-run)
1. <lane> — <pattern>. Recommendation: <chase / retry CI / skip>.

### Timeouts
1. <lane> — sub-class <(a)/(b)/(c)>. <Diagnosis>.

### Recommended fix order
1. <cluster> — <reason>
2. ...
```

**Wait for user approval.** The user may:
- Approve all proposed fixes.
- Reject or revise specific clusters.
- Opt in to fixing advisory lanes.
- Decide flakes / network timeouts are not worth fixing this round.
- Override priorities.

Do not proceed to Step 5 until the user has explicitly approved.

### Step 5: Apply Approved Fixes

For each approved cluster:
- Edit the implicated files. Use immutable update patterns (project rule).
- Never adapt a test to mask a bug — fix the code (CLAUDE.md TDD Bugfixing rule).
- For typecheck/build failures rooted in schema drift, update the related schema, types, and tests in the same change (FOUNDATIONS F2).
- Do NOT edit `.github/workflows/*.yml` to silence a lane. If a workflow change is the right answer, surface it at gate 1 — it is out of scope for this skill's auto-fix.

After edits, mark each cluster as `applied`.

### Step 6: Verify Locally Per Affected Lane

For each non-advisory lane that was failing:

1. Run the lane's local repro command (from the Step 2 lookup).
2. For `determinism-shard` lanes, build first: `pnpm -F @ludoforge/engine build`.
3. Confirm the lane PASSES.
4. If it still fails:
   - Re-diagnose. Update the cluster's proposed fix.
   - Return to Step 4 (gate 1) with the revised proposal.
   - Do NOT proceed to commit until every non-advisory failing lane passes locally.

If the user opted in to fixing an advisory lane at gate 1, verify it too.

Run any directly relevant supersets the project provides (e.g., when several `engine-tests` lanes are in scope, also run `pnpm -F @ludoforge/engine test:all` once at the end as a wider sanity check). Do not run unrelated full suites that would balloon runtime — verification is scoped to the lanes that were failing.

### Step 7: Commit & Present Diff — GATE 2

1. Stage the edits explicitly by file path (avoid `git add -A` / `git add .` per security rule).
2. Build commit subjects, one per cluster:
   - Default: `fix: <short cluster description>`.
   - If the cluster maps to an existing ticket: `Implemented <NS>-<NNN>` per repo convention.
   - Use HEREDOC for the commit message (per global git conventions).
   - Honor global attribution settings (do not override).
3. Show:
   - The full diff (`git diff --staged`).
   - The proposed commit subjects.
   - The number of commits to be created.
4. **Wait for explicit push approval.** The user may:
   - Approve the push.
   - Ask to amend a commit before pushing.
   - Ask to split / squash differently.
   - Cancel and review the diff manually.

Do NOT push until the user has explicitly approved.

### Step 8: Push

After approval:

1. Final safety checks (run all four; abort if any fails):
   - `git rev-parse --abbrev-ref HEAD` matches the PR head branch.
   - HEAD branch is NOT `main` or `master`.
   - `isCrossRepository` was `false` in Step 1, OR the user has explicitly authorized pushing to the fork.
   - No `--force` / `--no-verify` / `--force-with-lease` unless the user explicitly requested it.
2. Push: `git push` (no flags).
3. Note to the user: the push will trigger a fresh CI run. Do NOT invoke `gh run rerun` — it would create a redundant run on the previous SHA.

### Step 9: Final Summary

Present:
- PR number and head branch.
- Clusters fixed (with commit SHAs).
- Lanes verified locally (with pass/fail status).
- Advisory lanes left untouched (if any).
- Suspected flakes / network timeouts left for the user to decide on (if any).
- FOUNDATIONS conflicts that halted the skill (if any) — these still need resolution.
- New CI run URL (`gh pr checks <N>` or `gh run list --branch <head> --limit 1`).

Do not commit additional artifacts. The skill is conversational — diagnostic output stays in the transcript. If cluster count is ≥ 4, also write a record to `reports/ci-failures-pr-<N>-YYYY-MM-DD.md` summarizing the diagnosis table for future reference.

## Failure-class playbooks

Quick diagnostic angles per class. Not exhaustive — this is orientation for diagnosis, not a substitute for reading the actual log.

- **lint**: Read the ESLint output directly; usually self-explanatory. Check whether the offending rule is project-wide or scoped (`packages/*/eslint.config.js` if present). Common: unused imports, `no-explicit-any`, missing return types, formatting drift.
- **typecheck**: Read the `tsc` errors. FOUNDATIONS F2 — keep schemas (`packages/engine/schemas/`), types (`packages/engine/src/kernel/`), and tests synchronized. A type error in one place often signals drift in the other two.
- **build**: Usually downstream of typecheck. Also: missing import paths, `.js` vs `.ts` extension drift in ESM imports, missing files in compiled output.
- **test-lane (integration / e2e)**: Read the failing assertions. Check `git log --oneline <base>..HEAD -- <implicated-area>` to see what changed. Reproduce with the lane's repro command; reduce to a single test if possible (e.g., `node --test --test-name-pattern=<...>` for engine tests).
- **determinism-shard**: HIGH STAKES. FOUNDATIONS F1. Replay-identity or Zobrist-parity breaks usually mean a kernel state mutation that isn't being captured/replayed correctly, or a state-hash key drift. Read recent kernel/sim/agents commits and the specific test that broke; reproduce with the shard's `test_paths`.
- **memory**: Lane budget exceeded. Look for retained references in caches, accumulators, or RNG/state structures that should be transient. Compare allocation patterns in recent commits.
- **performance**: Lane budget exceeded. Check for accidental quadratic loops, unbounded `forEach`, or new code in hot paths. The performance budget is enforced by the lane itself — read its source to know the budget.
- **timeout (a) hang**: Add probe logs locally; isolate which `it()` or operation never returns. Often an unawaited promise or an infinite enumeration.
- **timeout (b) slowness**: Profile the lane locally (`node --inspect`, or naive timing). Determine whether the budget needs to grow (rare; needs justification) or the code regressed.
- **timeout (c) external**: Not a code defect. Recommend the user retry the lane via `gh run rerun --failed <run-id>` (user action, not skill action).
- **flake-suspect**: Already verified by 3x local re-run in Step 3. If it doesn't reproduce locally, propose: chase the non-determinism upstream, retry the lane in CI, or skip.

## Guardrails

- **FOUNDATIONS hard halt**: if any proposed fix violates `docs/FOUNDATIONS.md`, halt at gate 1 with 1-3-1. Never silently accept a Foundations-violating fix.
- **Codebase truth**: every implicated file path and function name validated against the actual codebase before being put in the diagnosis table.
- **Workflow YAML is authoritative**: lane→command mapping derives from `.github/workflows/*.yml`. The reference table in Step 2 is convenience — when in doubt, read the YAML.
- **No workflow edits**: do NOT modify `.github/workflows/*.yml` to silence a lane. If a workflow change is the right answer, surface it at gate 1; let the user decide. The skill's scope is "fix the code that the lane caught", not "rewrite the lane".
- **No tests adapted to bugs**: never weaken or skip a test to make it pass. Fix the code.
- **No `main` push**: HEAD must not be `main` or `master` at push time.
- **No force push, no `--no-verify`**: never use `--force`, `--force-with-lease`, `--no-verify`, `--no-gpg-sign`, or any other safety bypass unless the user explicitly requested it for this push.
- **No `git add -A` / `git add .`**: stage by explicit file path to avoid accidental inclusion of secrets or large binaries.
- **Cross-repo PRs**: if `isCrossRepository` is true, halt before push and ask the user; pushing to a fork is not assumed.
- **No auto-rebase**: do not rebase the PR branch against `main` without an explicit user request. Push the fix on top of the existing branch state.
- **No `gh run rerun`**: pushing the fix will trigger CI naturally. Re-running a previous SHA via `rerun` after pushing creates a redundant run.
- **Advisory lanes**: `node-compat` and `policy-profile-quality` shards are `continue-on-error: true`. Surface them at gate 1 but do not block on them; fix only if the user opts in.
- **Worktree discipline**: every command and path uses the worktree root if invoked inside a worktree.
- **Two gates always**: gate 1 (pre-fix) and gate 2 (pre-push) are mandatory. Auto mode does not waive them — auto mode is "not a license to destroy".
- **Files NOT touched**:
  - `.github/workflows/*.yml` — out of scope for auto-fix.
  - `main` branch — only the PR head branch is touched.
  - Any branch other than the PR head — verified before commit and before push.
- **Single PR focus**: each invocation handles one PR. If the user wants to recover multiple PRs, run the skill per PR.
