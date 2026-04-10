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

5. **Copy runtime files**: If the campaign has runtime files (`results.tsv`, `seed-tier.txt`, `musings.md`, `checkpoints.jsonl`, `lessons.jsonl`) in the source campaign folder but not in the worktree, copy them. These files are gitignored and won't be created by `git worktree add`.

## Phase 0 — Setup

#### File Verification

1. Read `$WT/campaigns/<campaign>/program.md` completely.
2. Verify `$WT/campaigns/<campaign>/harness.sh` exists and is executable.
3. Read `$WT/campaigns/<campaign>/results.tsv` — if it has data rows beyond the header, resume from the last accepted state (the current HEAD of the worktree branch IS the last accepted state).
4. Identify the **mutable files** from program.md. Read each one into context.
5. Identify the **root causes to seed** from program.md as the initial hypothesis queue.

#### Configuration

6. Read all configuration keys from program.md (see prerequisites reference). Apply defaults for any missing keys.
7. **Metric direction validation**: Read `METRIC_DIRECTION` from program.md (default: `lower-is-better`). Verify the accept/reject logic is consistent with this direction. **Hard error** if mismatched — do not proceed.
8. Read `MAX_ITERATIONS` from program.md (default: `unlimited`). Initialize `experiment_count = 0` (or resume from results.tsv row count).
9. Read `PRIMARY_METRIC_KEY` from program.md (default: `combined_duration_ms`).

#### State Initialization

10. Ensure `$WT/campaigns/<campaign>/musings.md` exists (create with `# Musings` header if missing). If results.tsv has only the header row AND this is a new worktree (not resuming), clear musings.md to the header only — prior campaign history belongs in `campaigns/lessons-global.jsonl`.
11. Initialize strategy state: `strategy = "normal"`, `consecutive_rejects = 0`, `total_accepts = 0`.
12. Read `campaigns/lessons-global.jsonl` if it exists — inject relevant global lessons into context.
13. Read `$WT/campaigns/<campaign>/lessons.jsonl` if resuming — prune lessons with `decay_weight < 0.3`. For lessons lacking a `type` field (backward compatibility), treat as `finding` (if `polarity: positive`) or `negative` (if `polarity: negative`).
14. **Continuation campaign detection**: If results.tsv has only the header row but musings.md contains prior experiment history, this is a continuation campaign. Read prior musings, note in musings: `**CONTINUATION**: This campaign builds on prior optimization.` Avoid repeating exhausted approaches.

## Phase 1 — Baseline

1. Run the harness from the worktree. If `HARNESS_RUNS > 1`, run it that many times and take the median:
   ```bash
   cd $WT && bash campaigns/<campaign>/harness.sh
   ```
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
   baseline	<baseline_metric>	0	baseline	ACCEPT	baseline measurement
   ```
8. Initialize `$WT/campaigns/<campaign>/checkpoints.jsonl` with the baseline:
   ```json
   {"exp_id": "baseline", "metric": <baseline_metric>, "commit": "<commit-hash>", "lines_delta_cumulative": 0, "description": "baseline", "timestamp": "<ISO-8601>"}
   ```

## Phase 2 — Improvement Loop

Run this loop INDEFINITELY (or until `MAX_ITERATIONS` reached). Never stop. Never ask permission. Never pause at "natural stopping points."

If program.md defines fixture sync or tiered mutability, load `references/advanced-commit-policies.md`.

### Step 0: ANCHOR (Condition Drift Prevention)

- Re-read `$WT/campaigns/<campaign>/program.md` objective section from disk.
- Compare the last 5 experiment descriptions (from results.tsv) against the declared objective.
- If the recent experiments are exploring tangential goals not aligned with the stated objective:
  - Append `**DRIFT WARNING**: Recent experiments drifted toward <tangent>. Refocusing on declared objective: <objective>.` to musings.md.
  - Force the next hypothesis to directly target the declared objective.
- Prevents condition drift in long-running loops.
- **Iteration cap**: If `MAX_ITERATIONS` is set (not `unlimited`) and `experiment_count >= MAX_ITERATIONS`, append to musings: `**ITERATION CAP**: Reached MAX_ITERATIONS (${MAX_ITERATIONS}). Exiting loop gracefully.` Exit the loop and proceed to "After Campaign Completes."

### Step 1: OBSERVE

- Re-read mutable files **from disk** (not from stale context). This ensures each iteration operates on fresh state.
- Verify that no immutable files have been modified since baseline. If any have, **hard error** — abort the loop.
- Review experiment history in results.tsv — what's been tried, what worked, what failed.
- Note the current `best_metric` and cumulative `lines_delta`.
- If the harness produces diagnostic artifacts (traces, logs, profiles) beyond the primary metric, read them to inform hypothesis generation. Campaign-specific OBSERVE protocols in program.md extend this step.

### Steps 1b-1f: STRATEGY MANAGEMENT

Load `references/strategy-management.md`. Execute Steps 1b through 1f as described there.

### Step 1g: META-REVIEW

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
- **Scope check**: Verify that ONLY declared mutable files were modified (`git diff --name-only` against mutable file list from program.md). If any non-mutable file was changed:
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
1. Review the worktree branch: `git log --oneline` shows all accepted improvements.
2. Promote high-confidence lessons to global store (if not already done by Step 7.6).
3. **Commit `campaigns/lessons-global.jsonl`** with `git add -f campaigns/lessons-global.jsonl && git commit -m "chore: promote global lessons from <campaign>"`. This file persists across campaigns — without this commit, lessons are lost when the worktree is removed.
4. Switch to the main repo root (NOT the worktree) and squash-merge:
   ```bash
   cd <main-repo-root> && git merge --squash improve/<campaign>
   ```
5. If `sync-fixtures.sh` exists, run it after the squash-merge (before committing) to ensure fixtures match the merged state. Verify with a quick build+test.
6. Commit the squash-merge with a summary message listing: (a) key infrastructure fixes, (b) policy/mutable file changes with metric impact, (c) lesson count promoted, (d) test changes. The detailed experiment history lives in musings.md and results.tsv (gitignored).
7. Remove the worktree and delete the branch:
   ```bash
   git worktree remove .claude/worktrees/improve-<campaign>
   git branch -D improve/<campaign>
   ```
   Force-delete (`-D`) is required because squash-merge does not mark the branch as merged.

## Human Investigation Interrupt

If the human interrupts the loop for investigation (e.g., "stop, investigate this crash", "analyze why this keeps failing", "look into the root cause"):

1. **Pause loop state**: Save current `consecutive_rejects`, `strategy`, `best_metric`, and `experiment_count` mentally. The loop is paused, not stopped.
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
