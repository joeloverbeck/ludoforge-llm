---
name: improve-loop
description: Iterative improvement loop — autonomously optimizes a mutable system against a fixed evaluation harness
---

# Improve Loop Skill

Autonomous optimization loop implementing Karpathy's iterative improvement pattern. Key mechanisms: UCB1 category selection, MAD confidence scoring, Goodhart's Law defenses, backtracking, near-miss tracking, plateau detection, cross-campaign lesson store, self-improving research strategy, condition drift anchoring, and correctness guards.

## Invocation

```
/improve-loop campaigns/<campaign-name>
```

## Prerequisites

Load `references/prerequisites-and-config.md`.

## Worktree Requirement (NON-NEGOTIABLE)

The improvement loop commits and rolls back frequently. It MUST run inside a dedicated git worktree to protect the main working tree.

1. Check if already in a worktree: `git rev-parse --show-toplevel`
2. If not in a worktree, create one:
   ```bash
   git worktree add .claude/worktrees/improve-<campaign> -b improve/<campaign> main
   ```
3. ALL subsequent file operations use the worktree root as the base path.

Set `WT` = the worktree root path. Every file path in every tool call below is prefixed with `$WT/`. For tool calls (Read, Edit, Glob, Grep), always use the full absolute worktree path — `$WT` is a conceptual prefix in this document, not a shell variable available to tools.

4. If the project uses a package manager, install dependencies in the worktree:
   ```bash
   cd $WT && pnpm install   # or npm install / yarn install
   ```

5. **Set persistent working directory**: After setup, run `cd $WT` as a standalone Bash command to anchor the session's working directory in the worktree. All subsequent Bash commands will execute from the worktree root. Do NOT rely solely on `cd $WT &&` chains — if any later command uses `cd` to another directory, the working directory drifts silently. Verify with `pwd` before the baseline harness run.

6. **Copy runtime files**: Copy ALL non-tracked files from the source campaign folder to the worktree campaign folder. Use `ls` to enumerate, then copy any that don't exist in the worktree. Common runtime files include `results.tsv`, `seed-tier.txt`, `musings.md`, `checkpoints.jsonl`, `lessons.jsonl`, `last-trace.json`, and `traces/`. These are gitignored and won't be created by `git worktree add`.

## Phase 0 — Setup

#### File Verification

1. Read `$WT/campaigns/<campaign>/program.md` completely.
2. Verify `$WT/campaigns/<campaign>/harness.sh` exists and is executable.
3. Read `$WT/campaigns/<campaign>/results.tsv` — if it has data rows beyond the header, resume from the last accepted state (the current HEAD of the worktree branch IS the last accepted state).
   - **Stale-baseline recovery**: if the recorded baseline commit hash from `checkpoints.jsonl` is not reachable from the worktree HEAD (verify with `git merge-base --is-ancestor <baseline-hash> HEAD`; non-zero exit = unreachable), the prior worktree was removed and the recorded state no longer matches the worktree branch. Treat this as a fresh restart: clear `results.tsv` to the header row, clear `checkpoints.jsonl`, reset `seed-tier.txt` to `INITIAL_SEED_TIER`, and proceed to Phase 1 (Baseline) as if no prior data existed. Document the reason in musings: `**STALE BASELINE**: Prior worktree removed; recorded baseline <hash> not reachable from new HEAD. Restarting from main.`
4. Identify the **mutable files** from program.md. If the mutable surface is a small set of files (<10), read each one into context. If the mutable surface is a directory tree (e.g., "all files under `packages/engine/src/`"), read only the files relevant to the current experiment hypothesis — the full tree is too large for context. Use profiling data and program.md's root causes to guide which files to read.
5. Identify the **root causes to seed** from program.md as the initial hypothesis queue.

#### Configuration

6. Read all configuration keys from program.md (see prerequisites reference). Apply defaults for any missing keys.
7. **Metric direction validation**: Read `METRIC_DIRECTION` from program.md (default: `lower-is-better`). Verify the accept/reject logic is consistent with this direction. **Hard error** if mismatched — do not proceed.
8. Read `MAX_ITERATIONS` from program.md (default: `unlimited`). Initialize `experiment_count = 0` (or resume from results.tsv row count).
9. Read `PRIMARY_METRIC_KEY` from program.md (default: `combined_duration_ms`).

#### State Initialization

10. Ensure `$WT/campaigns/<campaign>/musings.md` exists (create with `# Musings` header if missing). If results.tsv has only the header row AND this is a new worktree (not resuming), clear musings.md to the header only — prior campaign history belongs in `campaigns/lessons-global.jsonl`.
11. Initialize strategy state: `strategy = "normal"`, `consecutive_rejects = 0`, `total_accepts = 0`.
12. Read `campaigns/lessons-global.jsonl` if it exists — inject relevant global lessons into context. When applying global lessons from a different campaign (different `campaign` field), treat them as **hypotheses to verify**, not established facts. Cross-campaign lessons may be stale due to engine changes, different game mechanics, or different optimization targets. Note in musings which global lessons are being applied and flag any that come from campaigns targeting a different faction, game, or metric.
13. Read `$WT/campaigns/<campaign>/lessons.jsonl` if resuming — prune lessons with `decay_weight < 0.3`. For lessons lacking a `type` field (backward compatibility), treat as `finding` (if `polarity: positive`) or `negative` (if `polarity: negative`).
14. **Continuation campaign detection**: If results.tsv has only the header row but musings.md contains prior experiment history, this is a continuation campaign. Read prior musings, note in musings: `**CONTINUATION**: This campaign builds on prior optimization.` Avoid repeating exhausted approaches.

## Phase 1 — Baseline

1. Run the harness from the worktree. If `HARNESS_RUNS > 1`, run it that many times and take the median:
   ```bash
   cd $WT && bash campaigns/<campaign>/harness.sh
   ```
   **CRITICAL**: Always use `cd $WT &&` before the harness command. Harness scripts resolve `PROJECT_ROOT` from their own `SCRIPT_DIR` — running `bash campaigns/.../harness.sh` from the main repo root silently uses the main repo's files instead of the worktree's. When both trees have identical files (e.g., at baseline), this bug is silent but causes all subsequent experiments to evaluate against the wrong code.
2. Parse the harness output as key=value lines. Extract the primary metric using `PRIMARY_METRIC_KEY` (e.g., `compositeScore=10.5333` when `PRIMARY_METRIC_KEY=compositeScore`, or `combined_duration_ms=12345` for the default).
3. If multi-run: collect all primary metric values, compute MAD (see harness execution reference for MAD formula), record `baseline_metric` = median.
4. If single-run: record `baseline_metric` = the primary metric value.
5. Set `best_metric` = `baseline_metric`.
6. Commit current state as baseline:
   ```bash
   cd $WT && git add <mutable-files> && git commit --allow-empty -m "improve-loop: baseline (${PRIMARY_METRIC_KEY}=${baseline_metric})"
   ```
   Use specific file paths (not `git add -A`) to avoid accidentally staging unrelated files.
7. Append to results.tsv:
   ```
   baseline	<baseline_metric>	0	baseline	BASELINE	baseline measurement
   ```
   Use status `BASELINE` (see `references/prerequisites-and-config.md`). For backward compatibility with older campaigns, parsing tools should accept either `BASELINE` or `ACCEPT` on the initial baseline row.
8. Initialize `$WT/campaigns/<campaign>/checkpoints.jsonl` with the baseline:
   ```json
   {"exp_id": "baseline", "metric": <baseline_metric>, "commit": "<commit-hash>", "lines_delta_cumulative": 0, "description": "baseline", "timestamp": "<ISO-8601>"}
   ```

### Baseline Failure Protocol

If the baseline harness fails (non-zero exit), this is a **campaign-blocking issue**, not an experiment failure. Do NOT apply workarounds to make the harness pass.

1. **Investigate the root cause.** Follow the same diagnostic approach as the Human Investigation Interrupt protocol — read error output, trace logs, and reproduce minimally.
2. **If the root cause is in the game spec or engine** (not the campaign configuration): escalate as an engine limitation. Create a spec in the main repo root (not the worktree) documenting the bug with reproduction steps. Then trigger degenerate campaign completion — the campaign cannot proceed until the bug is fixed.
3. **If the root cause is in the campaign configuration** (wrong seed count, missing files, incorrect profile name, harness misconfiguration): fix the configuration and retry the baseline. This does not count as an experiment.
4. **Never mask a failing baseline with a workaround** (e.g., remapping error codes, suppressing exceptions, loosening assertions). A workaround produces unreliable metrics that invalidate all subsequent experiments.

## Phase 2 — Improvement Loop

Run this loop INDEFINITELY (or until `MAX_ITERATIONS` reached). Never stop. Never ask permission. Never pause at "natural stopping points."

If program.md defines fixture sync or tiered mutability, load `references/advanced-commit-policies.md`.

### Step 0: ANCHOR (Condition Drift Prevention + CWD Verify)

- **CWD verify**: Run `pwd` and confirm the cwd matches `$WT`. If drift is detected (e.g., from a prior `cd` to the main repo for diagnostic work, end-of-campaign prep, or a Human Investigation Interrupt), re-anchor with `cd $WT`. The Phase-0 anchor only holds until the first cross-tree command; in long campaigns the cwd drifts silently otherwise, and downstream commits land on the wrong tree. This check is cheap; do it every iteration.
- Re-read `$WT/campaigns/<campaign>/program.md` objective section from disk.
- Compare the last 5 experiment descriptions (from results.tsv) against the declared objective.
- If the recent experiments are exploring tangential goals not aligned with the stated objective:
  - Append `**DRIFT WARNING**: Recent experiments drifted toward <tangent>. Refocusing on declared objective: <objective>.` to musings.md.
  - Force the next hypothesis to directly target the declared objective.
- Prevents condition drift in long-running loops.
- **Iteration cap**: If `MAX_ITERATIONS` is set (not `unlimited`) and `experiment_count >= MAX_ITERATIONS`, append to musings: `**ITERATION CAP**: Reached MAX_ITERATIONS (${MAX_ITERATIONS}). Exiting loop gracefully.` Exit the loop and proceed to "After Campaign Completes."

### Step 1a: REFRESH (Correctness)

- Re-read mutable files **from disk** (not from stale context). This ensures each iteration operates on fresh state. If the mutable surface is a directory tree, re-read only the specific files modified in the previous experiment. If no experiment has run yet, read the files identified by profiling as hot paths.
- Verify that no immutable files have been modified since baseline. If any have, **hard error** — abort the loop.
- Review experiment history in results.tsv — what's been tried, what worked, what failed.
- Note the current `best_metric` and cumulative `lines_delta`.

### Step 1b: DIAGNOSE (Decision Landscape)

**Mandatory triggers** — run the full diagnostic when ANY of these apply:
- First iteration at a new tier or phase
- After `ZERO_EFFECT_THRESHOLD` (default 3) consecutive zero-effect experiments
- Every `PIVOT_CHECK_INTERVAL` experiments

**Diagnostic protocol**:
1. Read trace/diagnostic artifacts produced by the harness (traces, logs, profiles).
2. If the campaign's program.md defines an **OBSERVE Phase Protocol**, follow its campaign-specific diagnostic steps (e.g., decision classification rules, trace parsing format, what to extract from per-seed traces). The OBSERVE protocol is the campaign's domain-specific diagnostic — the skill does not hardcode game-specific classification logic.
3. If no OBSERVE protocol is defined, apply a generic diagnostic: identify the evolved system's decision points, count tied decisions (score gap < 0.001), and record a summary in musings.
4. Record the diagnostic summary in musings (whatever the protocol produces).

**When NOT triggered**: read diagnostic artifacts if the harness produces them to inform hypothesis generation. This lighter-weight observation is always appropriate but does not replace the full diagnostic at trigger points.

### Steps 1c-1g: STRATEGY MANAGEMENT

Load `references/strategy-management.md`. Execute Steps 1c through 1g as described there.

### Step 1h: META-REVIEW

If `meta_improvement: true` in program.md, load `references/meta-review.md`.

### Step 2: HYPOTHESIZE

- **Check for human override first:** Does `$WT/campaigns/<campaign>/next-idea.md` exist?
  - If yes: read its contents as the hypothesis. Rename to `next-idea.used-exp-NNN.md`. Skip normal generation.
  - If no: proceed with normal hypothesis generation below.

- **Strategy-specific generation:**
  - `normal`: Select the category with the highest UCB1 score (from Step 1c). Propose ONE specific, testable change within that category. If early in the campaign, draw from the "root causes to seed" list. Consult local and global lessons for patterns that have worked in similar contexts.
  - `combine`: Select 2-3 near-miss stashes (`git stash apply stash@{N}`), apply them together, test as one experiment.
  - `ablation`: Review recent accepted commits, propose removing complexity from one of them.
  - `radical`: Propose a fundamentally different approach — different algorithm, restructured data flow, etc.

- **DSL awareness (agent evolution campaigns):** Before proposing a DSL extension (Tier 2), consult `docs/agent-dsl-cookbook.md` to verify the existing DSL cannot already express the needed strategy. The cookbook documents all available operators, reference paths, intrinsics, and common patterns.

- If stuck in `normal` mode: re-read all mutable files, combine near-miss ideas, try radical alternatives, consult lessons for unexplored angles.

- **Partial signal guidance:** If recent experiments show partial signals in `intermediates.jsonl` (some metrics improved, others regressed), focus the hypothesis on extending improvement to the regressing subset.

### Step 2.5: RECORD HYPOTHESIS (Structured Reflection)

Append to `$WT/campaigns/<campaign>/musings.md`:
```markdown
## exp-NNN: <description>
**Category**: <UCB1-selected category> (UCB1 score: X.XX)
**Hypothesis**: <1-2 sentences on why this should improve the metric>
```

### Step 3: IMPLEMENT

- Apply the change to the mutable files in the worktree.
- **Scope check**: Verify that ONLY declared mutable files were modified (`git diff --name-only` against mutable file list from program.md). Files modified by `sync-fixtures.sh` (golden/snapshot fixtures) are derived artifacts and are excluded from the scope check — they follow the same commit/rollback policy as the mutable files that generated them. If any non-mutable, non-fixture file was changed:
  - Rollback: `cd $WT && git checkout -- <all-changed-files>`
  - Log as `REJECT` with description `"scope violation: touched immutable file <path>"`
  - Append to musings: `**SCOPE VIOLATION**: Attempted to modify <path>, which is not in the mutable file list.`
  - Skip to Step 8 (REPEAT).
- Count `lines_delta` for this change (net lines added minus lines removed across all mutable files).
- Tag the change with a `category` from program.md's experiment categories list.
- **Fixture sync**: If `$WT/campaigns/<campaign>/sync-fixtures.sh` exists, run it now (after implementing changes, before executing the harness):
  ```bash
  cd $WT && bash campaigns/<campaign>/sync-fixtures.sh
  ```
  This prevents stale-fixture test failures from wasting the first experiment iteration.

### Step 3.5: SMOKE TEST (optional fast pre-check)

If the campaign harness takes >5 minutes per run, perform a lightweight pre-check before the full harness:

1. Build the project (catches compilation errors in ~30s instead of discovering them mid-harness).
2. Run a single-seed benchmark (not the full harness) to catch obvious failures:
   - If state_hash differs from baseline → REJECT immediately (determinism violation). Log: `"determinism violation: state_hash changed"`.
   - If the primary metric is worse than `best_metric` by more than `ABORT_THRESHOLD` → REJECT immediately (obvious regression).
3. Only proceed to Step 4 (full harness) if the smoke test passes.

The smoke test does NOT run the test suite — that's the harness's job. It is a fast filter that saves 10+ minutes per obviously-bad experiment.

**Determinism pre-check guidance**: Experiments that change control flow affecting move selection (bypassing evaluation functions, altering action selection logic, modifying RNG threading) are especially likely to cause determinism violations. Prioritize the smoke test for these.

### Steps 4-5: EXECUTE and MEASURE

Load `references/harness-execution.md`. Execute Steps 4, 4d, and 5 as described there.

### Step 6: DECIDE

Load `references/accept-reject-logic.md`. Execute Step 6 and 6b as described there.

### Step 7: LOG

Append a row to `$WT/campaigns/<campaign>/results.tsv`:
```
<experiment_id>	<metric_value>	<lines_delta>	<category>	<ACCEPT|REJECT|NEAR_MISS|EARLY_ABORT|CRASH|SUSPICIOUS_ACCEPT|BACKTRACK>	<description>
```

Use a sequential experiment ID: `exp-001`, `exp-002`, etc. (continue from where results.tsv left off).

**IMPORTANT**: After logging results.tsv, ALWAYS proceed to Step 7.5 (musings) then Step 7.6 (lesson extraction). Do not skip to Step 8.

### Step 7.5: RECORD LEARNING (Structured Reflection)

Append to `$WT/campaigns/<campaign>/musings.md`:
```markdown
**Result**: <status> (<old_metric> -> <new_metric>, noise_floor: X%)
**Partial signals**: <if any intermediate metrics showed directional improvement/regression>
**Learning**: <what was learned — confirmed/refuted hypothesis, surprising observations, what to try differently>
```

**V8 JIT deopt pattern detection**: If 3+ consecutive rejects show measured regressions (not within-noise, but slowdowns >1%) with root causes attributable to V8 JIT deoptimization (object shape changes, closure body modifications, hidden class mutations, WeakMap/caching overhead in kernel execution paths), flag as `**V8 JIT CEILING**` in musings. Skip directly to ceiling report with architectural spec creation (Option D in Step 1g). Further micro-optimization experiments are provably futile — the architecture must change. This pattern is distinct from a normal plateau (where experiments are within noise) — V8 deopt regressions are ACTIVE performance degradation, not just failure to improve.

**Zero-effect detection**: If the evolved system's trace is functionally identical to the previous experiment, flag as `**ZERO-EFFECT**` in the musings entry. For agent evolution campaigns, compare the evolved seat's move sequence (actionIds in order) and final margin from the trace files. Byte-level trace comparison is too strict (timestamps, intermediate scores may differ); compare the decision-relevant fields only. For non-agent campaigns, compare the primary metric output and any trace summary the harness produces. Increment `consecutive_zero_effects` (reset on any non-zero-effect experiment). After `ZERO_EFFECT_THRESHOLD` (default 3) consecutive zero-effect experiments, the next iteration's Step 1b DIAGNOSE becomes mandatory — the hypothesis space is misaligned with the actual decision landscape. Zero-effect means the targeted decisions already have large score gaps; look for decisions with small gaps instead.

### Step 7.6: EXTRACT LESSON

Load `references/lesson-management.md`. Execute the curation gate and lesson extraction as described there.

### Step 8: REPEAT

Go back to Step 1. Do NOT stop.

## Git Operations Summary

| Event | Action |
|-------|--------|
| ACCEPT | `git add <files>` + `git commit -m "improve-loop: ..."` + append to checkpoints.jsonl |
| REJECT | `git checkout -- <files>` |
| NEAR_MISS | `git stash push -m "near-miss-exp-NNN: ..." -- <mutable-files> <regenerated-fixture-files>` |
| EARLY_ABORT | `git checkout -- <files>` (or kill harness + checkout) |
| CRASH (trivial) | Fix, retry (up to 3x) |
| CRASH (fundamental) | `git checkout -- <files>`, log, continue |
| Combine strategy | `git stash apply stash@{N}` for 2-3 near-miss stashes |
| BACKTRACK | `git reset --hard <checkpoint-commit>` |
| SUSPICIOUS_ACCEPT | Same as ACCEPT but with warning in musings |
| META-REVIEW revert | Restore program.md from program.md.backup |
| Infrastructure (Tier 3+) | `git add <files>` + `git commit -m "infra: <description>"` — committable at any time during OBSERVE |

`results.tsv`, `musings.md`, `checkpoints.jsonl`, `lessons.jsonl`, `intermediates.jsonl`, and `run.log` are untracked (gitignored) — they persist across accepts and rejects but are not committed.

**Infrastructure commits outside experiments**: Tier 3 (observability) and campaign infrastructure changes (trace improvements, harness updates, documentation) can be committed at any point during the OBSERVE phase, not only during the IMPLEMENT->DECIDE cycle. Use commit messages prefixed with `infra:` and log in musings, but do NOT log in results.tsv (they are not experiments).

**Exception**: `campaigns/lessons-global.jsonl` is NOT gitignored — it MUST be committed during campaign completion (see below).

## After Campaign Completes

When the human decides to stop the loop (or `MAX_ITERATIONS` is reached):

**Degenerate campaign** (zero accepted experiments — only infrastructure commits or early halt due to a discovered bug/limitation): simplify the completion flow:
1. Create specs if engine limitations were discovered (in the main repo root, not the worktree).
2. Copy gitignored runtime files back to the source campaign folder (see step 4 below). The musings.md from a degenerate campaign contains diagnostic history (investigation notes, baseline analysis, root cause findings) that may be valuable when the campaign is restarted after the blocking issue is resolved — preserve it on disk even though it's not committed.
3. **Pre-merge check**: Verify the branch has commits worth keeping: `git diff main...improve/<campaign> --stat`. If no meaningful diff remains (all changes were reverted in the working tree, or only invalid/diagnostic commits exist), skip the squash-merge and proceed directly to step 5.
4. If the branch has useful infrastructure commits: switch to the main repo root and squash-merge. Commit with a summary noting the campaign was halted due to `<reason>` and listing infrastructure changes. Skip lesson promotion and metric impact summary.
5. Remove the worktree and delete the branch (step 9 below).

**Normal campaign** (one or more accepted experiments):

This sequence crosses between the worktree and the main repo. Each step is annotated with its required cwd. **Verify with `pwd` after every cwd switch** — the Phase-0 anchor does not survive cross-tree work, and the lessons commit landing in the wrong tree is a known pitfall.

1. Review the worktree branch: `git log --oneline` shows all accepted improvements. *(cwd: worktree)*
2. Promote high-confidence lessons to global store (if not already done by Step 7.6). *(cwd: worktree — append to the worktree's `campaigns/lessons-global.jsonl`)*
3. **Commit `campaigns/lessons-global.jsonl`** *(cwd: worktree, on the campaign branch — verify with `pwd` and `git branch --show-current` before staging)*:
   ```bash
   cd $WT && pwd  # must show worktree path
   git branch --show-current  # must show improve/<campaign>
   git add -f campaigns/lessons-global.jsonl
   git commit -m "chore: promote global lessons from <campaign>"
   ```
   This file persists across campaigns — without this commit, lessons are lost when the worktree is removed. The squash-merge in step 5 picks up this commit; landing it on main directly bypasses that path and leaves the worktree branch missing the promotion.
4. **Preserve runtime files**: Copy gitignored campaign runtime files (`results.tsv`, `musings.md`, `checkpoints.jsonl`, `lessons.jsonl`) from the worktree back to the source campaign folder in the main repo. These files are gitignored there too but persist on disk for future campaign resumption. Without this step, `git worktree remove` deletes the campaign's diagnostic history. *(no cwd change required; uses absolute paths)*
5. Switch to the main repo root (NOT the worktree) and squash-merge:
   ```bash
   cd <main-repo-root> && pwd  # verify cwd is main, not worktree
   git merge --squash improve/<campaign>
   ```
6. If `sync-fixtures.sh` exists, run it after the squash-merge (before committing) to ensure fixtures match the merged state. Verify with a quick build+test. *(cwd: main repo root)*
7. Commit the squash-merge with a summary message listing: (a) key infrastructure fixes, (b) policy/mutable file changes with metric impact, (c) lesson count promoted, (d) test changes. The detailed experiment history lives in musings.md and results.tsv (gitignored). *(cwd: main repo root)*
8. **Spec triage**: Review the ceiling report and musings for engine limitations, DSL gaps, or infrastructure needs discovered during the campaign. Spec creation can happen at any of three points: (a) during a Human Investigation Interrupt, (b) between user-directed campaign halt and squash-merge (e.g., user says "write the spec, then squash-merge"), or (c) post-merge as a follow-up. In all three cases, specs are project-level artifacts — create them in the main repo root (not the worktree) as a separate commit; the squash-merge does not include them. If specs already exist when reaching this step, reference them in the squash-merge commit message but skip creation. *(cwd: main repo root)*
9. Remove the worktree and delete the branch *(cwd: main repo root)*:
   ```bash
   git worktree remove --force .claude/worktrees/improve-<campaign>
   git branch -D improve/<campaign>
   ```
   `--force` on `git worktree remove` is required because the worktree contains gitignored runtime files (results.tsv, traces/, run logs, etc.); these have already been preserved by step 4, so the force-remove is safe. `-D` on `git branch` is required because squash-merge does not mark the branch as merged.

## Human Investigation Interrupt

If the human interrupts the loop for investigation (e.g., "stop, investigate this crash", "analyze why this keeps failing", "look into the root cause"):

1. **Pause loop state**: Save current `consecutive_rejects`, `strategy`, `best_metric`, and `experiment_count` mentally. The loop is paused, not stopped. **CWD verify on resume**: investigation may legitimately `cd` to the main repo to read source, run greps, or inspect specs. Before resuming the loop, run `pwd` and re-anchor with `cd $WT` if needed — drift here causes downstream commits to land on the wrong tree. Step 0 ANCHOR will also verify cwd, but verifying at resume catches the issue one step earlier.
2. **Investigate**: Follow the human's direction. The investigation may produce Tier 2/3 infrastructure commits — commit these with `infra:` prefix and log in musings, but do NOT log in results.tsv.
3. **Resume protocol**: After investigation completes:
   - If the investigation **unlocked new capabilities** (fixed a fragile test, added infrastructure that enables previously-blocked features, etc.): reset `consecutive_rejects = 0` and `strategy = "normal"`. Note in musings: `**CAPABILITY UNLOCKED**: <description>. Resetting plateau counter.`
   - If the investigation was **diagnostic only** (no new capabilities): resume from saved state with no reset.
4. The human may redirect from investigation to campaign completion — follow their direction. This can happen via ceiling report options (B/D), or directly when the investigation reveals a structural limitation that makes continuing the loop unproductive. Skip to "After Campaign Completes" with any infrastructure commits from the investigation included in the squash merge.
5. **Engine limitation discovery**: If the investigation reveals an engine/DSL/runtime limitation (not a campaign design issue), document it as a spec and adjust the campaign approach to work within the limitation. Log in musings: `**ENGINE LIMITATION**: <description>. See Spec NNN.`
6. **Bug fix during investigation**: If the investigation reveals a code bug (not a policy issue):
   1. Implement the fix in engine code.
   2. Run the full test suite.
   3. Commit with a descriptive message (use `fix:` prefix, not `infra:`).
   4. If the fix changes compiled output, run `sync-fixtures.sh` and commit fixture updates separately.
   5. Re-run the harness to establish the post-fix baseline.
   6. Update `best_metric` if the baseline changed.
   7. Log the fix in musings with `**BUG FIX**:` prefix.
   8. This counts as "unlocked new capabilities" — reset `consecutive_rejects = 0` and `strategy = "normal"`.

## Guardrails

These rules are unique to this section; all other constraints are defined inline in their respective workflow steps.

- **Never weaken assertions** — the tests must remain equally rigorous.
- **Never add dependencies** — optimize with what's available.
- **Profile-coupled tests**: If a test fails because the evolved profile changed the game trajectory (not because the code is broken), this is a profile-coupling issue, not a code bug. Fix the test to be resilient to profile evolution: use search-based witnesses instead of hardcoded seed/ply pairs, use regex matching for consideration term names instead of exact string lists, and widen search bounds for witness finding. Commit test decoupling as `infra:` independent of the experiment. Does NOT count toward the 3-retry CRASH limit.
