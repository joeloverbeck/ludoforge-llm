# Strategy Management

## Step 1c: CHECK STRATEGY (Plateau Detection)

- Count consecutive rejects (including NEAR_MISS and EARLY_ABORT) from the tail of results.tsv.
- If count >= `PLATEAU_THRESHOLD`:
  - Check for near-miss stashes (`git stash list | grep near-miss`)
  - If near-misses exist and strategy is `normal` → switch to `combine`
  - If no near-misses or already tried combine → switch to `ablation` (review recent accepts, try removing complexity)
  - If already tried ablation → switch to `radical` (large structural changes, rethink approach)
  - If already tried radical → switch to `backtrack` (see Step 1d)
- After any ACCEPT, reset `strategy = "normal"` and `consecutive_rejects = 0`.
- After any **tier/phase advance** (including unwinnable seed escape), reset `consecutive_rejects = 0` and `strategy = "normal"`. The new tier is a fresh optimization context.

**Surface exhaustion trigger**: If the agent has documented evidence in musings that the mutable surface is exhausted at the current tier (all reasonable parameter/consideration changes produce identical or worse trajectories), this counts as an alternative ceiling trigger even if not all 5 strategies have been formally cycled. The evidence must include: (1) what changes were tried, (2) why they produce identical traces or worse outcomes, (3) what structural constraint prevents improvement. This prevents wasting iteration budget on provably futile strategy cycling.

**Early structural diagnosis**: If trace analysis proves a seed is structurally unwinnable BEFORE hitting PLATEAU_THRESHOLD (e.g., the player gets fewer than 3 decisions before an opponent wins, with a deficit no single action can overcome), document the specific evidence in musings and advance the tier immediately. Do not require PLATEAU_THRESHOLD futile experiments — that wastes iteration budget on provably impossible targets.

Evidence for structural unwinnability MUST include per-decision trace data from the seed: (a) how many evolved-seat decisions occur, (b) what actions are chosen and their score gaps, (c) what the opponent does that causes the loss, (d) the strategic vs tactical decision breakdown. Absence-of-improvement from experiments alone is necessary but not sufficient — you must demonstrate WHY no policy change can alter the outcome.

**Tier-wide structural ceiling**: If trace analysis across ALL current-tier seeds shows the evolved seat has structurally no path to improvement (e.g., all traces are deterministically locked regardless of weight changes, or all seeds end before the evolved seat gets enough actions), this constitutes a tier-wide ceiling. Document the evidence across all seeds and advance the tier immediately without waiting for PLATEAU_THRESHOLD experiments.

**Multi-tier jumps**: When advancing past an exhausted tier, the next tier's baseline MUST be established before resuming experiments. Multi-tier jumps (e.g., tier 2 to 5) are permitted when the structural diagnosis evidence applies to the entire tier range, but a baseline harness run at the new tier is mandatory. Reset `consecutive_rejects = 0` and `strategy = "normal"` after any tier advance.

**Rapid tier advancement**: If a new tier's baseline wins ALL new seeds without any policy changes (wins == tier), skip the improvement loop for that tier and advance immediately. Repeat until a tier introduces a new non-winning seed. Log the rapid advancement batch in musings.

## Step 1d: COMPUTE UCB1 CATEGORY SCORES

- Group results.tsv rows by `category` column.
- Compute per-category:
  - `success_rate = accepts / attempts`
  - `ucb1_score = success_rate + UCB_EXPLORATION_C * sqrt(ln(total_experiments) / category_attempts)`
- Categories with 0 attempts get `ucb1_score = infinity` (always explored first).
- Rank categories by UCB1 score. The top-ranked category is the preferred target for hypothesis generation in `normal` mode.

## Step 1e: BACKTRACK CHECK

- If strategy is `backtrack`:
  1. Read `$WT/campaigns/<campaign>/checkpoints.jsonl`.
  2. Select the checkpoint with the best metric (lowest `metric` value). If metrics are within 1%, prefer the one with lower `lines_delta_cumulative`.
  3. Execute: `cd $WT && git reset --hard <commit>`
  4. Append to results.tsv: `backtrack-NNN	<checkpoint_metric>	0	backtrack	BACKTRACK	backtracked to <exp_id> (metric: <X>)`
  5. Append to musings: `## backtrack-NNN\n**Backtracked to <exp_id>** (metric: <X>). Previous HEAD was at exp-MMM (metric: <Y>). Reason: exhausted all strategies from current position.`
  6. Reset `strategy = "normal"`, `consecutive_rejects = 0`.
  7. Update `best_metric` to the checkpoint's metric.
  8. Cross-reference musings and results.tsv to identify experiments already tried from this checkpoint — avoid repeating them.

## Step 1f: PROCEED/REFINE/PIVOT CHECK

- Every `PIVOT_CHECK_INTERVAL` experiments, evaluate the campaign's trajectory:
  - **PROCEED** (accept rate in last N > 20%): Current approach is productive. Continue normally.
  - **REFINE** (accept rate >= 10% and <= 20%): Approach has potential but is underperforming. Adjust parameters — tighten/loosen thresholds, shift category priorities, re-read mutable files for missed angles.
  - **PIVOT** (accept rate < 10%): Approach is exhausted. Consult lessons (local and global) for alternative strategies. If lessons suggest a pattern, adopt it. If no relevant lessons, trigger `radical` strategy regardless of consecutive reject count.

## Step 1g: CEILING DETECTION (Hard Ceiling Report)

- Count total consecutive non-accepts (REJECT, NEAR_MISS, EARLY_ABORT, CRASH) from the tail of results.tsv.
- If count >= `CEILING_THRESHOLD` (default: `2 * PLATEAU_THRESHOLD`) AND all strategies (normal, combine, ablation, radical, backtrack) have been attempted since the last ACCEPT:
  1. Generate a **ceiling report** in musings.md. The report MUST include per-decision trace evidence (read 2-3 per-seed traces before writing):
     ```markdown
     ## CEILING REPORT
     **Ceiling metric**: <best_metric value>
     **Experiments since last accept**: <N>
     **Strategies exhausted**: normal, combine, ablation, radical, backtrack
     **Categories attempted**: <list with attempt counts and success rates>
     **Decision landscape at ceiling**: <MANDATORY — from per-seed trace analysis>
       - Tied decisions (gap < 0.001): N% of total (N out of M)
       - Strategic vs tactical split: N strategic, M tactical
       - Average gap: strategic=X, tactical=Y
       - Most improvable decision type: <strategic|tactical> (smallest avg gap)
     **Architectural bottlenecks identified**: <list of root causes, grounded in trace evidence>
     **Recommended next steps**: <specs, infrastructure changes, or scope adjustments>
     ```
     A ceiling report without per-decision trace evidence is invalid — it risks misdiagnosing the bottleneck (e.g., tuning strategic weights when tactical decisions are the real bottleneck).
  2. Append to results.tsv: `ceiling-NNN	<best_metric>	0	ceiling	REJECT	hard ceiling reached after N experiments`
  3. **Pause for human input**: Present the ceiling report to the user and wait for direction. This is NOT "stopping the loop" — it is a structured handoff when the mutable system is proven incapable of further improvement within the current architectural constraints. Present the following options:
     - **Option A**: Human provides a `next-idea.md` → resume the loop with that hypothesis.
     - **Option B**: Human says to stop → proceed to "After Campaign Completes."
     - **Option C**: **Program.md amendment** — if the ceiling is caused by program.md's accept/reject logic being structurally incompatible with the optimization trajectory (e.g., a flat AND rule that blocks clearly beneficial tradeoffs), propose a specific amendment with reasoning. Present as a 1-3-1 option: the problem, 3 alternative rule formulations, and a recommendation. Apply only with human approval.
     - **Option D**: **Architectural spec creation** — if the ceiling is caused by engine/DSL/infrastructure limitations (not program.md tuning or mutable surface changes), document the specific gaps as formal specs. List the capabilities that would unblock further optimization and how they align with `docs/FOUNDATIONS.md`. Create the spec file in the main repo root (not the worktree) — specs are project-level artifacts, not experiment artifacts. The spec can be committed directly in main or staged for the squash-merge — follow the human's direction. This transitions the campaign from "optimize within constraints" to "identify which constraints to lift."
