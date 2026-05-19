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
   - The `statusCheckRollup` field already lists every check's `name`, `conclusion`, and `detailsUrl` (which contains run/job IDs). Use it directly to skip the separate `gh pr checks` and `gh run list --branch` calls in step 1.4 — fall back to `gh run list` only when you need fields not in the rollup (e.g., to disambiguate cancelled-run causes via run-level metadata).

2. **Verify HEAD matches the PR head branch**.
   - Compare `git rev-parse --abbrev-ref HEAD` with the PR's `headRefName`. If they differ, abort and ask the user to check out the PR branch first. The skill must NOT operate on the wrong branch.

3. **Detect cross-repository / fork PRs**.
   - If `isCrossRepository: true`, halt at gate 1 (Step 4) before any push. Pushing to a fork requires write access not assumed by this skill — flag for the user to push manually or grant access.

4. **Enumerate failing & timing-out checks**.
   - `gh pr checks <N>` for the rollup status.
   - `gh run list --branch <headRefName> --limit 20 --json databaseId,name,status,conclusion,headSha,workflowName,jobs` to map check names to run IDs.
   - For each failed/cancelled run, identify its specific failed jobs. Cancelled jobs whose log ends mid-step or whose duration is at the workflow's `timeout-minutes` budget are **timeouts**, not generic failures — classify accordingly in Step 3.

5. **Download failed logs**.
   - For each failed run/job: `gh run view <run-id> --log-failed > /tmp/ci-fix-<run-id>.log`. **For cancelled runs, `--log-failed` returns empty because no step failed before the runner was killed. Capture the full log via `gh run view <run-id> --log > /tmp/ci-fix-<run-id>-full.log` instead.** Cancelled runs are most often timeouts — see Step 3's timeout sub-classification.
   - When a run contains a matrix of lanes and only some fail, prefer per-job downloads to avoid mixing unrelated failure logs: `gh run view --job <job-id> --log-failed > /tmp/ci-fix-<job-id>.log`. Find job IDs in the `jobs` field of `gh run list --json ...,jobs`, or in the `detailsUrl` of each `statusCheckRollup` entry.
   - For logs >1000 lines, grep first to localize failure markers: `grep -nE 'FAIL|✖|not ok|##\[error\]|AssertionError' /tmp/ci-fix-<run-id>.log`. The matched line ranges bracket the section worth reading. Test runners often emit `Error:` strings as captured test output (e.g., recovery-fence test cases that print `Error: ticker exploded`), so grep on assertion-shape patterns rather than raw `Error:` to avoid noise.
   - Note: GitHub Actions truncates very long step names to `UNKNOWN STEP` in `--log` output (a common case for matrix jobs whose step names embed multi-line `test_paths` blocks). To isolate per-step progress when this happens, grep on the truncated check-name (column 1 of `gh run view --log`) instead of the step name.
   - For determinism / policy-profile-quality lanes that upload artifacts: `gh run download <run-id> -n <artifact-name> -D /tmp/ci-fix-artifacts/` to inspect shard-specific output (e.g., `policy-profile-quality-shard-<id>` artifacts).

6. **Verify clean working tree** (per CLAUDE.md Concurrent Session Awareness).
   - Run `git status --porcelain`. If non-empty, surface the unrelated edits to the user before proceeding. Assume another session or user may be active; do not overwrite or "clean up" those changes. The skill must isolate its diff from any pre-existing in-progress state.

Record what was found: list of (check-name, run-id, job-name, conclusion, duration, log-path) tuples for use in subsequent steps.

### Step 2: Build Lane→Command Lookup

For each failing job, derive the local reproduction command. The workflow YAML is the authoritative source — when in doubt, read it.

**Known lanes** (canonical mapping; shard lists may drift from this table — defer to `.github/workflows/*.yml` for current shard IDs and run commands when names don't match):

| Workflow | Job / Lane | Local repro |
|----------|------------|-------------|
| `ci.yml` | `ci` (lint step)       | `pnpm turbo lint` |
| `ci.yml` | `ci` (typecheck step)  | `pnpm turbo typecheck` |
| `ci.yml` | `ci` (build step)      | `pnpm turbo build` |
| `ci.yml` | `ci` (test step)       | `pnpm turbo test` |
| `ci.yml` | `node-compat` (build only, Node 20) | `nvm use 20 && pnpm install --frozen-lockfile && pnpm turbo build` |
| `engine-tests.yml` | `build`                                | `pnpm -F @ludoforge/engine build` |
| `engine-tests.yml` | `test (fitl-events-shard-<id>)`        | `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-<id>` |
| `engine-tests.yml` | `test (policy-canaries)`               | `pnpm -F @ludoforge/engine test:integration:policy-canaries` |
| `engine-tests.yml` | `test (fitl-rules)`                    | `pnpm -F @ludoforge/engine test:integration:fitl-rules` |
| `engine-tests.yml` | `test (texas-cross-game)`              | `pnpm -F @ludoforge/engine test:integration:texas-cross-game` |
| `engine-tests.yml` | `test (slow-parity-shard-<id>)`        | `pnpm -F @ludoforge/engine test:integration:slow-parity:shard-<id>` |
| `engine-tests.yml` | `test (e2e-all)`                       | `pnpm -F @ludoforge/engine test:e2e:all` |
| `engine-tests.yml` | `test (memory)`                        | `pnpm -F @ludoforge/engine test:memory` |
| `engine-tests.yml` | `test (performance)`                   | `pnpm -F @ludoforge/engine test:performance` |
| `engine-determinism.yml` | `determinism (<shard>)`        | `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane determinism <shard test_paths from yaml>` |
| `engine-determinism.yml` | `policy-profile-quality (<shard>)` | `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane policy-profile-quality <shard test_paths from yaml>` (advisory; `continue-on-error: true`) |
| `engine-determinism.yml` | `policy-profile-quality-report` | Aggregation job; failures usually downstream of shard failures — fix shards first, then re-evaluate. |

**Unknown lanes**: read the relevant `.github/workflows/*.yml`, locate the job by name, and extract the run command from the matrix entry. Treat the YAML as the source of truth — never rely on stale skill-internal mappings. Convention shortcut: GitHub Actions check names for `engine-tests.yml` matrix lanes embed the matrix params in parentheses as `test (<id>, <script>, <timeout>)` — the second param is the npm script, which often gives the local repro (`pnpm -F @ludoforge/engine <script>`) without opening the YAML. Validate against the YAML when in doubt.

For determinism shards, the test paths for each shard are listed in `engine-determinism.yml` under `matrix.include`. Locate the shard by `shard_id` and copy the `test_paths` block verbatim.

### Step 3: Triage & Cluster

Classify each failure and cluster lanes by suspected root cause. One root cause often fans out to multiple lanes — diagnose the cause once per cluster, not once per lane.

**Base-branch resolution.** All `main` references in this step (and in Step 9's chronic-PR detection) resolve to `origin/main`. Run `git fetch origin main` before any command that names `main` as a ref — `git merge-base`, `git worktree add`, `git bisect`, `git log <main>..HEAD`, `git diff <main>..HEAD`, `git diff --stat <main>..HEAD`, and any other survey/comparison command. Local `main` may lag the remote by several commits, which would silently change the merge-base, the bisect lower bound, the "PR-introduced vs main-introduced" classification, and survey commands' commit/diff counts.

**Read prior CI-failure reports first.** Check `reports/ci-failures-pr-<N>-*.md` (any date suffix) before clustering. Prior reports may identify the chronic-PR history, prior root causes (now fixed or still active), and what fix attempts did NOT work — saving rediscovery effort. If a prior report identifies a different cluster than the current failures, treat the prior cluster as "previously addressed; verify it's still fixed" and proceed to diagnose the new cluster. If a prior report identifies the SAME cluster, the chronic-PR record-writing rule from Step 9 already applies — extend the prior report rather than starting fresh.

**Failure classes**:
- `lint` — ESLint errors. Usually quick: unused imports, unsafe types, formatting.
- `typecheck` — TypeScript errors. CLAUDE.md "Schema synchronization" (the coding convention) is a frequent culprit when types and schemas have drifted.
- `build` — `tsc` or `vite` build failure. Usually downstream of typecheck or import-path drift.
- `test-lane` — assertion failures within an integration / e2e / memory / performance lane.
- `determinism-shard` — replay-identity, Zobrist parity, or runtime-parity break. **High stakes** — Foundation 8 (Determinism Is Sacred). Treat as critical.
- `policy-profile-quality` — quality regression on an evolved profile. Advisory (continue-on-error).
- `node-compat` — Node 20 build failure. Whether the lane is advisory depends on `continue-on-error` in the current `ci.yml` — verify at triage.
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
- If the failing lane has not run on main since a recent CI/workflow restructure (check `gh run list --branch main --workflow=<name> --limit 5 --json conclusion,createdAt,headSha` against the workflow file's git history), the regression may be pre-existing on main, surfaced by workflow changes rather than introduced by the PR — bisect against main commits, not just `<base>..HEAD`. **Special case**: if the lane has *never* run on main (zero results), bisect is impossible — see the unified detection rule immediately below.

**Brand-new lane + pre-existing-failure detection — one call answers both**: A single `gh run list --workflow=<workflow-file> --branch main --limit 5 --json databaseId,conclusion,headSha,createdAt` answers both. Run it once per failing workflow at the top of triage. Branch on results:

- **Zero results**: the lane is brand-new on this PR — its timeout/budget was never validated against main. Treat the cluster as `structural` (lane budget needs adjustment, e.g., shard or raise `timeout-minutes`) by default; surface as such at gate 1. Pre-existing-failure detection and bisect are meaningless — skip both. Confirm by inspecting the workflow's git history (`git log --oneline -- .github/workflows/<name>`) for a recent restructure that introduced the lane.
- **≥1 result**: pick the most-recent `success` SHA as the last-green-main reference. Use a fresh `git worktree add /tmp/<worktree-name> <last-green-main-sha>`, build the engine, and run the failing test's local repro there. Last-green-main is also the bisect lower bound; merge-base (where the PR diverged) is only relevant when the PR has diverged significantly and you need to understand the inheritance window.
  - If it FAILS on last-green main → cluster is `pre-existing`. Default scope: out-of-scope for this PR; flag in the gate 1 table as "pre-existing on main, not caused by this PR" so the user can decide whether to fix it in this PR or defer to a separate PR.
  - If it PASSES on last-green main → cluster is a real PR regression; proceed with the standard diagnosis path.
  - The user may opt in (at gate 1) to fixing pre-existing clusters in this PR. When they do: bisect to find the original breaking commit between last-green-main and current main HEAD, then propose a surgical fix at that origin point.

**Lighter-weight variant — did my just-applied edits cause this failure?** Use `git stash`, rebuild, run the repro, then `git stash pop`. Verifies the PR-HEAD baseline (without your edits) rather than the last-green-main baseline. Cheaper than worktree when you only need to attribute a failure to your own diff vs. the PR's pre-fix state — common when iterating gate 1 rounds where verification surfaces failures and you need to know whether you introduced them.

**Bisect when regression source is unclear**: When a `test-lane` failure doesn't point to an obvious recent commit (or after pre-existing-failure detection identifies a regression that originated on main), use `git bisect` rather than manually checking out commits one by one. Identify the last-green SHA via `gh run list --branch main --workflow=<name> --limit 5`, then `git bisect start && git bisect bad HEAD && git bisect good <last-green-sha>`. Mark each bisect step by running the failing test's local repro. This compresses an N-commit linear search to ~log₂(N) bisect steps.

**Bisect optimizations**:
- **Automate when possible**: when the failing test's local repro is a single repeatable command, prefer `git bisect run <script>` (where the script exits 0 = good, 1 = bad, 125 = skip) over manual marking — the loop runs unattended.
- **Skip-as-good for non-source commits**: a commit whose `git diff-tree --no-commit-id --name-only -r <sha>` shows only `docs/`, `tickets/`, `archive/`, `.github/`, `.claude/`, `.codex/`, or other non-source paths cannot introduce engine regressions — mark it good without rebuilding/running. Inspect with `git diff-tree` first; only build/test commits that touch `packages/`.

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

**Hypothesis-validation prototype (allowed)**: Diagnosis confidence often requires testing the proposed fix to prove it eliminates the failure. Editing the implicated files at this step solely to validate the diagnosis hypothesis is permitted — present the gate 1 diagnosis with a "Verification done locally" line listing what was tested and observed. The user-approval requirement still applies before the fix's final shape/scope is committed; if the user rejects or revises the cluster, revert the prototype edits before proceeding. Do not commit, do not push, and do not run the full Step 6 verification suite during prototyping — that comes after gate 1 approval.

**Hypothesis-validation prototype cleanup**: Before applying the approved fix in Step 5, revert any diagnostic instrumentation (`process.stderr.write`, `console.log`, temporary helper functions, ad-hoc `.mjs` scripts checked into source) added during prototyping — even if the user approved the diagnosis. Verify clean state via `git diff` before staging in Step 7; instrumentation that survives into the staged diff is a real failure mode (would push diag prints into production code). When prototyping required instrumenting more than one file, use `git diff --stat` to enumerate changed files and walk each one before applying the real fix.

Otherwise, present the diagnosis as a structured table:

```
## PR #<N>: CI Failure Diagnosis

### Clusters

| Cluster | Lanes | Class | Status | Root Cause | Proposed Fix | Foundations | Priority |
|---------|-------|-------|--------|------------|--------------|-------------|----------|
| <name>  | <lanes> | <class> | <status> | <one-line> | <one-paragraph> | <Foundation 1, Foundation 2, ...> | HIGH/MED/LOW |

Status values: `PR regression` (lane was green on main, broken by this PR) | `pre-existing on main` (lane was already failing on last-green main) | `structural` (lane is brand new or budget never validated; needs shard/timeout adjustment) | `flake-suspect` (verified by 3x local re-run).

### Lane-by-lane detail

#### Lane: <check-name> (run <run-id>)
- Class: <failure-class>
- Local repro: `<command>`
- Cluster: <cluster-name>
- Evidence (log excerpt, stack trace, or relevant artifact lines): ...
- Profile evidence (if performance/timeout class — `--cpu-prof` flame, `--prof` bottom-up summary, or `console.time` localization): ...

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

**Wait for user approval.** (`AskUserQuestion` is a natural fit when the menu has ≥2 independent decisions — e.g., one question per cluster, one for advisory-lane opt-in, one for fix-scope. Batch them in a single structured prompt rather than asking sequentially.) The user may:
- Approve all proposed fixes.
- Reject or revise specific clusters.
- Opt in to fixing advisory lanes.
- Opt in to fixing pre-existing failures (clusters tagged `pre-existing` in the diagnosis table).
- Decide flakes / network timeouts are not worth fixing this round.
- Override priorities.
- Choose fix scope when a cluster admits multiple shapes (e.g., minimal correctness fix vs. minimal fix + dead-code cleanup vs. broader refactor). Surface these alternatives explicitly in the gate 1 message when removing the broken path leaves unreachable code, when the fix surface naturally extends to adjacent dead exports, when a more invasive redesign exists, or when a failing test's `@test-class` classification is questioned by the failure (e.g., an `architectural-invariant`-marked test whose assertion empirically depends on a corpus shape that has just shifted — distill / retarget / reclassify are distinct fix shapes).
- Opt in to follow-up spec authorship — when the cluster's root cause matches a Step 10 architectural-gap pattern, the spec can be drafted at gate 1 instead of post-push. Default shape: separate commit, same push as the fix, so the spec ships alongside the fix it documents. The user may instead defer to Step 10's standard post-push flow if the gap is uncertain or wants iteration before the spec is committed.

Gate 1 may iterate. If the user rejects the diagnosis or asks for deeper investigation (e.g., a profile, a bisect, a source-modification experiment to confirm the root cause), return to Step 3 with the additional evidence and re-present at Step 4. The gate is closed only when the user explicitly approves the cluster table — first-round approval is the happy path, not the contract.

Do not proceed to Step 5 until the user has explicitly approved.

### Step 5: Apply Approved Fixes

For each approved cluster:
- Edit the implicated files. Use immutable update patterns (project rule).
- Never adapt a test to mask a bug — fix the code (CLAUDE.md TDD Bugfixing rule). However, when a test's expected value asserted the buggy output (e.g., a `deepEqual` snapshot of a misformed compiled artifact), updating the expectation to match the corrected output is required, not a violation. Distinguish: weakening a contract (forbidden) vs updating a snapshot of a now-fixed contract (correct).
- For typecheck/build failures rooted in schema drift, update the related schema, types, and tests in the same change (CLAUDE.md "Schema synchronization" coding convention).
- Do NOT modify `.github/workflows/*.yml` as part of unilateral auto-fix. Two motives can require workflow YAML changes — *silencing a lane* (out of scope: never propose) and *fixing the workflow contract* (e.g., an unbuilt artifact a new test lane needs, a missing toolchain step, an under-budgeted timeout). The latter is in scope when surfaced as part of a cluster's proposed-fix at gate 1; once gate 1 approves, the workflow edit lands in Step 5 alongside the code edits.
- **Fix-implementation scaffolding cleanup**: If the approved fix required a one-off regeneration / re-bless / capture script (e.g., recapture fixtures, re-bless snapshots, regenerate golden traces), follow the same cleanup discipline as Step 4's hypothesis-validation prototype rule — delete the script after the artifacts it produced have landed in the working tree, and verify clean state via `git status --short` / `git diff --stat` before Step 7's stage. Scaffolding scripts that exist solely to produce the fix's artifacts must not survive into the staged diff; only the artifacts themselves are part of the cluster's fix. This extends Step 4's diagnostic-instrumentation cleanup rule to fix-implementation scaffolding — the principle is identical (the staged diff contains only the user-approved fix), the trigger is different (Step 4 covers prototyping artifacts; this covers implementation artifacts).

After edits, mark each cluster as `applied`.

### Step 6: Verify Locally Per Affected Lane

For each non-advisory lane that was failing:

1. Run the lane's local repro command (from the Step 2 lookup).
2. For any engine lane consuming `packages/engine/dist/` (effectively every `engine-tests.yml` and `engine-determinism.yml` lane), build first: `pnpm -F @ludoforge/engine build`. For lanes consuming the policy WASM module (`policy-canaries`, anything invoking `loadPolicyWasmRuntime`), build the wasm package too: `pnpm -F @ludoforge/engine-wasm build` (requires Rust toolchain with `wasm32-unknown-unknown` target).
3. Confirm the lane PASSES.
4. If it still fails:
   - Re-diagnose. Update the cluster's proposed fix.
   - Return to Step 4 (gate 1) with the revised proposal.
   - Do NOT proceed to commit until every non-advisory failing lane passes locally — except per the environment-constrained verification rule below.

**Or — if verification SUCCEEDS for the original cluster but reveals a NEW failure that was masked by the prior one** (two distinct sub-cases): **(i) halt-at-first-error pipelines** — lint masking a build break, one Node-only import masking another, one failing test masking the next; or **(ii) tautological-baseline exposure** — the fix re-engages work the bug was bypassing, surfacing tests / pinned baselines that were tautologically passing under the bug (e.g., a perf gate calibrated against the buggy fast-path; a snapshot stamped while the assertion under audit was returning `undefined`; a corpus parameter set so trajectory differences fall just inside the loop budget). Treat the new failure as a new cluster, append it to the diagnosis, and re-gate at Step 4 with the additional cluster. Each round of unmasking advances the recovery; do not commit until verification reveals no further masked failures. The "Lighter-weight variant" stash technique in Step 3 is the right tool for distinguishing whether a newly-surfaced failure was caused by your edits or pre-existed in PR HEAD. Note: sub-case (ii) often resolves to a recalibration follow-up rather than additional fixes — surface it at the next gate 1 with the recalibration as a candidate "fix scope" so the user can choose between recalibrate-now (in this same commit / PR) and recalibrate-later (separate follow-up commit / PR).

**Environment-constrained verification**: If running a lane locally has previously crashed/hung the development environment in this session (e.g., WSL2 hang, OOM kill) OR the lane's CI duration is >15min AND its heaviness is structural (large determinism / property-test sweeps, multi-minute tournament runs), the user may approve a scoped verification: run faster sibling tests + final `pnpm turbo lint typecheck` + a fresh `pnpm -F @ludoforge/engine build`, and rely on CI for the heavy lane itself. Surface this trade-off explicitly in the gate 2 message — list which lanes were verified locally and which were deferred to CI, with the reason. This is a deliberate scoped exception, not a general bypass: every lane that CAN be verified locally without environment risk MUST still be verified locally.

**Crash-triggered fallback**: If a local verification attempt crashes the development environment (WSL2 hang, OOM kill, IDE freeze, system unresponsiveness), the assistant SHOULD immediately surface this rule to the user before any retry — the same lane is likely to crash again on the same hardware. Do not silently retry the same command. Ask the user to choose between (a) scoped local verification per the rule above, (b) deferring the heavy lane to CI, or (c) restructuring the lane (e.g., sharding) so that no single sub-lane exceeds local resource budgets.

If the user opted in to fixing an advisory lane at gate 1, verify it too.

Also run `pnpm turbo lint typecheck` once after the fix edits land, per CLAUDE.md Pre-Completion Verification — these are cheap, catch unused-import / type-drift fallout from the edits, and are mandatory before commit per the project-global rule.

Run any directly relevant supersets the project provides (e.g., when several `engine-tests` lanes are in scope, also run `pnpm -F @ludoforge/engine test:all` once at the end as a wider sanity check), **subject to the same environment-constrained verification rule above** — if the superset's resource profile risks a repeat env crash, defer it to CI and note that explicitly at gate 2. Do not run unrelated full suites that would balloon runtime — verification is scoped to the lanes that were failing.

### Step 7: Commit & Present Diff — GATE 2

1. Stage the edits explicitly by file path (avoid `git add -A` / `git add .` per security rule). After staging, run a sentinel grep across the staged diff for common instrumentation patterns: `git diff --cached -- packages/ | grep -nE 'process\.stderr\.write|console\.log|DIAG_|@diag-' | head -20`. Any hits other than pre-existing call sites should be removed before continuing to gate 2 — this backstops the Step 4 hypothesis-prototype cleanup rule programmatically. If the prototype involved ad-hoc `.mjs` scripts, also run `git status --short | grep -E '\.mjs$'` and confirm they are not in the staged set.
2. Build commit subjects, one per cluster:
   - Default: `fix: <short cluster description>`.
   - If the cluster maps to an existing ticket: `Implemented <NS>-<NNN>` per repo convention.
   - If the cluster is a witness-retarget / golden-trace re-bless / snapshot or fixture regeneration (the test or fixture moves, not the production code): `test: retarget <witness or fixture description>` per `.claude/rules/testing.md` Update Protocol. Mirrors the Step 4 fix-scope language — "distill / retarget / reclassify are distinct fix shapes" — and signals to a reviewer that the diff is a deliberate trajectory re-alignment rather than a production-code fix.
   - Use HEREDOC for the commit message (per global git conventions).
   - Honor global attribution settings (do not override).
   - **When clusters are interdependent (later clusters fix problems unmasked by earlier clusters), bundle them into a single commit.** Per-cluster commits are appropriate when each cluster could land alone and leave CI green; bundled commits are appropriate when partial landing leaves CI red for a different reason. State the chosen shape and the rationale at gate 2 so the user can override.
3. Show:
   - The full diff (`git diff --staged`).
   - The proposed commit subjects.
   - The number of commits to be created.
4. **Wait for explicit push approval.** (`AskUserQuestion` is appropriate here too — a single-question structured prompt with approve / amend / split / cancel options surfaces the menu cleanly when the diff is non-trivial.) The user may:
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
- New CI run URL — run `gh pr checks <N>` or `gh run list --branch <head> --limit 1` to fetch it, then present the URL itself in the summary (not the command).
- Optional follow-up: if the affected lanes are heavy (>15 min CI duration), or verification was scoped per the environment-constrained rule in Step 6, end the reply with a one-line `/schedule` offer to recheck CI status in 30–60 min. Keep this soft — many fixes complete CI fast enough that a schedule isn't needed, and the offer should not delay closing the workflow.
- Optional follow-up: if Step 10's architectural-gap scan flagged one or more patterns, end the reply with a one-line offer to draft the suggested spec (e.g., "Want me to draft `specs/<NNN>-<slug>.md` for the gap I flagged?"). The user often wants this immediately; the offer surfaces the path.

Do not commit additional artifacts. The skill is conversational — diagnostic output stays in the transcript. Write a record to `reports/ci-failures-pr-<N>-YYYY-MM-DD.md` summarizing the diagnosis table for future reference when EITHER (a) cluster count is ≥ 4, OR (b) `git log --oneline <merge-base>..HEAD` shows ≥ 2 commits with subject prefix `fix(` whose subjects reference the same workflow / lane that's still failing now (chronic-PR case — prior fix attempts on this branch did not resolve the lane), OR (c) a prior `reports/ci-failures-pr-<N>-*.md` file already exists for this PR — append a new dated report rather than starting fresh, and explicitly note in its "what did NOT work" section whether the prior cluster's root cause is still active or has been since fixed by intervening commits. For the chronic-PR case, the record should preserve the gate 1 cluster table verbatim plus a one-paragraph "what did NOT work" summary citing the prior fix commits, so the next session can pick up where this one left off without re-bisecting from scratch.

### Step 10: Architectural-Gap Scan (post-push)

Hot-fixes for CI failures often paper over an architectural gap rather than close it. After the push lands, scan the staged diff for any of these patterns; each is a candidate architectural gap that warrants a follow-up spec in `specs/<NNN>-<slug>.md`:

**If a Step 10 pattern was already surfaced and approved at gate 1** (via the follow-up-spec fix-scope option in Step 4), the spec was authored before push and Step 10 is a confirmation step only — verify the gap is captured by the existing draft, and skip the new-draft offer for that pattern. The post-push offer below still applies for any *additional* patterns that surface only after the fix is shipped.

- **Opt-in flags on `ExecutionOptions` or similar config bags** that gate alternative behavior between callers (e.g., simulator vs. test helpers). Often signals that the kernel needs a structural state field every caller observes uniformly, rather than a flag that splits the behavior tree.
- **New typed errors caught at >1 call site and translated to a different signal**. Often signals that the condition should be a queryable, deterministic state-shape property rather than an exception thrown at one boundary and caught at another.
- **Generic walkers or sanitizers added defensively to a serialization, validation, or normalization pass** (e.g., a recursive BigInt walker added to a serializer that previously handled BigInts only at named fields). Often signals that the schema's structural recursion is incomplete; a typed traversal is the architectural fix.
- **Test helpers or downstream consumers that re-implement a kernel loop** to inject behavior the kernel doesn't expose as a hook (e.g., a verification helper with its own `while (true)` simulation loop). Often signals a Foundation 5 violation; the kernel should expose the loop body as a reusable primitive.
- **Manual propagation of structural state fields after a state-rebuilding kernel call** (e.g., a hot-fix that explicitly copies field X from a post-effect state into a separately-rebuilt runtime, because the rebuild path otherwise drops it). Often signals that the helper that rebuilds the runtime is shaped `runtime → runtime` (forcing callers to thread a stale snapshot) rather than `state → state` (which derives runtime internally and cannot drop fields). The architectural fix is to convert the helper shape so the field cannot be silently dropped at any caller seam.
- **Wide-barrel re-exports that pull host-environment-specific code into cross-environment clients** (e.g., a `kernel/index.ts` that re-exports a Node-only file with top-level `node:fs` imports, transitively pulled into a browser bundle via a downstream value-import from the barrel). Often signals that the engine source needs explicit environment-isolation discipline (sibling `*-node-loader.ts` files for Node-only IO, kept out of browser-safe barrel exports; ESLint scoping to forbid `node:*` in browser-safe directories). The architectural fix is a documented convention plus a lint rule, not just splitting individual files as they break.
- **Silent-default fallback in paired dispatch tables after an F14-style safety-net deletion** (e.g., a JS-side dispatch function whose `default: return undefined` branch silently swallows opcode/feature kinds the upstream emitter still produces, where a previously-deleted closure-tree / generic interpreter was the de facto safety net catching emitter/evaluator drift). Often signals that an atomic cut deleted a generic fallback without restoring the equivalent try/catch + direct-evaluator pattern. Symptom: the bug doesn't throw, doesn't lint-fail, doesn't typecheck-fail — it silently returns a zero-equivalent value, corrupts a downstream computation (agent score, derived metric, hash), and is detected several layers downstream by an invariant test that notices the corrupted output. The architectural fix is to restore the paired-contract safety net: defensive throw in the dispatch's `default:`, try/catch in the caller falling back to an in-tree complete-coverage evaluator. Reference shape: `specs/154-policy-bytecode-emitter-evaluator-dispatch-completeness.md`.

For each pattern observed, name the gap (one short sentence), suggest a candidate spec number (the next free `specs/` index — verify the candidate isn't already used in `archive/specs/` either, since spec numbers are unique across both directories in this repo) and slug, and offer to write the spec. Use existing specs as the format template (e.g., `specs/148-runtime-interned-identifier-comparison.md` or `specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md`). Do NOT auto-write specs without user approval — produce hints; leave authorship to the user. If the user accepts the offer, draft the spec file directly via Write and leave it untracked for the user to review and commit; do not stage or commit the spec in the same push as the CI fix unless the user explicitly asks, since the spec is a discrete review surface that benefits from its own commit boundary.

This step is post-push and additive: the fix is already shipped. The architectural-gap follow-up is a separate effort, not a blocker for closing CI failures. If no patterns match, say so and skip — false positives here would dilute the signal.

## Failure-class playbooks

Quick diagnostic angles per class. Not exhaustive — this is orientation for diagnosis, not a substitute for reading the actual log.

- **lint**: Read the ESLint output directly; usually self-explanatory. Check whether the offending rule is project-wide or scoped (`packages/*/eslint.config.js` if present). Common: unused imports, `no-explicit-any`, missing return types, formatting drift. Also check whether the lint script uses `--max-warnings 0` (engine package does; runner does too) — under that flag, warnings are blocking. Fix all warnings, not just errors, when the lane fails on `max-warnings`.
- **typecheck**: Read the `tsc` errors. CLAUDE.md "Schema synchronization" — keep schemas (`packages/engine/schemas/`), types (`packages/engine/src/kernel/`), and tests synchronized. A type error in one place often signals drift in the other two.
- **build**: Usually downstream of typecheck. Also: missing import paths, `.js` vs `.ts` extension drift in ESM imports, missing files in compiled output. For vite/rollup-driven browser bundles (e.g., `@ludoforge/runner`): errors like `"<symbol>" is not exported by "__vite-browser-external"` indicate engine code with top-level `node:*` imports has been pulled into the browser bundle. Trace the import chain from the offending compiled file backward through the runner's `@ludoforge/engine/*` subpath imports; the fix shape is to split file IO into a sibling `*-node-loader.ts` (see Step 10's wide-barrel host-environment-leak pattern).
- **test-lane (integration / e2e)**: Read the failing assertions. Check `git log --oneline <base>..HEAD -- <implicated-area>` to see what changed. Reproduce with the lane's repro command; reduce to a single test if possible (e.g., `node --test --test-name-pattern=<...>` for engine tests). When the failing test points to a regression but the breaking commit isn't obvious, switch to `git bisect` (see Step 3 "Bisect when regression source is unclear"). When the failure trace points to stale state queries during effect dispatch, suspect a violation of Foundation 11's (Immutability) scoped-internal-mutation contract — a private working state observed before finalization, or aliasing that leaked outside the effect scope. When a test-lane assertion compares only a status / kind field (`'failed' !== 'ready'`, `null !== <value>`, etc.), write a quick `.mjs` diagnostic that re-creates the call and prints all result fields — opaque outcome assertions usually have a richer adjacent error / reason / context field that names the actual defect. For *count-based* assertions (`captures.length > 0`, `decisions.length === N`, `evaluations === expected`) where the count is unexpectedly zero or off and the single-`.mjs`-diagnostic doesn't localize *why*, layer instrumentation in the suspect call chain: add `process.stderr.write` lines at the dispatch table's entry, the suspected fan-out points, and the receiver of the counted event. Run the same instrumented script against a worktree of last-green main (per Step 3's pre-existing-failure detection) and diff the call counts; the divergence localizes the gap to a specific stage in the chain. Revert all instrumentation before Step 5 (per Step 4's hypothesis-validation prototype cleanup rule). When the failing test carries a `// @test-class: architectural-invariant | convergence-witness | golden-trace` marker, consult `.claude/rules/testing.md` § 'Update Protocol' before choosing a fix shape — the marker dictates whether to fix the kernel, retarget the witness, distill into a property-form invariant, or re-bless a golden trace, and the wrong fix shape silently weakens or destroys the test's defect-class coverage.
- **determinism-shard**: HIGH STAKES. Foundation 8 (Determinism Is Sacred), often interacting with Foundation 11 (Immutability — scoped internal mutation must remain isolated from caller-visible state). Replay-identity or Zobrist-parity breaks usually mean a kernel state mutation that isn't being captured/replayed correctly, a state-hash key drift, or a private working state leaking across scopes. Read recent kernel/sim/agents commits and the specific test that broke; reproduce with the shard's `test_paths`. When a single shard's test file contains multiple `describe` blocks (e.g., one per game's profile family), use `node --test --test-name-pattern=<...>` to isolate the slow / failing block before suspecting the kernel — a slowdown or break concentrated in one game's profile is a strong hint about the regression's locus (e.g., a policy-preview perf regression that surfaces only on FITL profiles' preview-using considerations, not on Texas default agents).
- **memory**: Lane budget exceeded. Look for retained references in caches, accumulators, or RNG/state structures that should be transient. Compare allocation patterns in recent commits.
- **performance**: Lane budget exceeded. Check for accidental quadratic loops, unbounded `forEach`, or new code in hot paths. The performance budget is enforced by the lane itself — read its source to know the budget. If the failing assertion measures a *derived quantity* (e.g., `totalCompoundTurns`, `decisions.length`, `legalMoves.length`, candidate counts) that depends on agent or kernel decision-making rather than wall-time, the cause may be upstream — a policy-eval / agent-scoring / kernel-effect bug producing different (worse) trajectories. Check whether the lane's *cost* (run duration, allocation count) is roughly comparable to last-green main while only its *count* metric is up; if so, follow the test-lane playbook (instrumentation diff against main worktree) rather than profiling hot paths — the trajectory is wrong, not the code path's per-step cost.
- **timeout (a) hang**: Add probe logs locally; isolate which `it()` or operation never returns. Often an unawaited promise or an infinite enumeration.
- **timeout (b) slowness**: Profile the lane locally — `node --cpu-prof --cpu-prof-dir=<dir> <command>` produces a `.cpuprofile` viewable in Chrome DevTools' Performance panel; use `node --inspect` only when interactive debugging is needed; naive `console.time` / `time` is acceptable for first-pass localization. Determine whether the budget needs to grow (rare; needs justification) or the code regressed. **For lanes that genuinely hang** (don't terminate cleanly, so SIGTERM kills the process before `--cpu-prof` flushes), fall back to V8's statistical profiler: `node --prof <command>` streams `isolate-*.log` continuously to disk and survives a SIGKILL. After the process is killed, summarize with `node --prof-process isolate-*.log` to get bottom-up call attribution.
- **timeout (c) external**: Not a code defect. Recommend the user retry the lane via `gh run rerun --failed <run-id>` (user action, not skill action).
- **flake-suspect**: Already verified by 3x local re-run in Step 3. If it doesn't reproduce locally, propose: chase the non-determinism upstream, retry the lane in CI, or skip.

## Guardrails

- **FOUNDATIONS hard halt**: if any proposed fix violates `docs/FOUNDATIONS.md`, halt at gate 1 with 1-3-1. Never silently accept a Foundations-violating fix. Before citing a Foundations principle by number (e.g., "Foundation 8") in a diagnosis or commit message, verify the number against the current `docs/FOUNDATIONS.md` — section numbering can shift when principles are added or removed.
- **Codebase truth**: every implicated file path and function name validated against the actual codebase before being put in the diagnosis table.
- **Workflow YAML is authoritative**: lane→command mapping derives from `.github/workflows/*.yml`. The reference table in Step 2 is convenience — when in doubt, read the YAML.
- **No silencing-motive workflow edits**: never propose a `.github/workflows/*.yml` change whose motive is to silence a failing lane. Workflow changes whose motive is to fix a workflow-contract bug (missing artifact, missing toolchain step, under-budgeted timeout) are in scope when surfaced as a cluster's proposed-fix at gate 1; once approved they land in Step 5 with the code edits. Workflow refactors unrelated to a current failure go through normal review channels, not this skill.
- **No tests adapted to bugs**: never weaken or skip a test to make buggy code pass. However, when a test's expected value asserted the buggy output (e.g., a `deepEqual` snapshot of a misformed compiled artifact), updating the expectation to match the corrected output is required, not a violation. Distinguish: weakening a contract (forbidden) vs updating a snapshot of a now-fixed contract (correct).
- **No `main` push**: HEAD must not be `main` or `master` at push time.
- **No force push, no `--no-verify`**: never use `--force`, `--force-with-lease`, `--no-verify`, `--no-gpg-sign`, or any other safety bypass unless the user explicitly requested it for this push.
- **No `git add -A` / `git add .`**: stage by explicit file path to avoid accidental inclusion of secrets or large binaries.
- **Cross-repo PRs**: if `isCrossRepository` is true, halt before push and ask the user; pushing to a fork is not assumed.
- **No auto-rebase**: do not rebase the PR branch against `main` without an explicit user request. Push the fix on top of the existing branch state.
- **No `gh run rerun`**: pushing the fix will trigger CI naturally. Re-running a previous SHA via `rerun` after pushing creates a redundant run.
- **Advisory lanes**: `policy-profile-quality` shards are `continue-on-error: true`; `node-compat` may or may not be (verify in `ci.yml` at triage time). Surface advisory lanes at gate 1 but do not block on them; fix only if the user opts in.
- **Worktree discipline**: every command and path uses the worktree root if invoked inside a worktree.
- **Two gates always**: gate 1 (pre-fix) and gate 2 (pre-push) are mandatory. Auto mode does not waive them — auto mode is "not a license to destroy".
- **Files NOT touched**:
  - `.github/workflows/*.yml` — never modified by auto-fix; modified only when the user explicitly approves a structural change at gate 1 (shard, timeout adjustment, missing artifact, missing toolchain step, etc.).
  - `main` branch — only the PR head branch is touched.
  - Any branch other than the PR head — verified before commit and before push.
- **Single PR focus**: each invocation handles one PR. If the user wants to recover multiple PRs, run the skill per PR.
