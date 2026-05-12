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

6. **Copy runtime files**: Copy ALL non-tracked files from the source campaign folder to the worktree campaign folder. Use `ls` to enumerate, then copy any that don't exist in the worktree. Common runtime files include `results.tsv`, `seed-tier.txt`, `checkpoints.jsonl`, `lessons.jsonl`, `last-trace.json`, and `traces/`. These are gitignored and won't be created by `git worktree add`. **`musings.md` is conditional**: it may be tracked or gitignored depending on the campaign — verify with `git check-ignore campaigns/<campaign>/musings.md` and copy only if gitignored. If tracked, the worktree already has the canonical version from `git worktree add`; copying from main would either be a no-op or could mask a deliberate truncation the user committed to main.
   - **Project-wide build artifacts (auto-mirror)**: if the engine test suite or harness depends on compiled binaries that are gitignored, mirror them from the source repo to avoid a fail-then-mirror cycle. Auto-mirror these well-known paths if they exist in the source: any directory named `target/` at any depth under `packages/` (Rust / Cargo / wasm-pack output — enumerate exhaustively with `find packages -type d -name target` rather than relying on a fixed-depth glob, since real Rust workspace layouts often nest `target/` two levels deep, e.g., `packages/engine-wasm/policy-vm/target/`), `packages/engine/dist/` (TypeScript build output), `packages/runner/dist/`. Use `cp -r <src> <dst>` if `<src>` exists and `<dst>` does not. For other gitignored build outputs not in this list, run `git status --ignored` in the source repo to enumerate, then mirror the relevant ones (typically the compiled outputs the test gate loads). Failed test runs after `git worktree add` with `ENOENT` errors for paths under `packages/**/target/` or `dist/` are the diagnostic signal — see Phase 1 Baseline Failure Protocol step 3 for the symptom-to-fix mapping.

## Phase 0 — Setup

#### File Verification

1. Read `$WT/campaigns/<campaign>/program.md` completely.
2. Verify `$WT/campaigns/<campaign>/harness.sh` exists and is executable.
3. Read `$WT/campaigns/<campaign>/results.tsv` — if it has data rows beyond the header, resume from the last accepted state (the current HEAD of the worktree branch IS the last accepted state).
   - **Stale-baseline recovery**: if the recorded baseline commit hash from `checkpoints.jsonl` is not reachable from the worktree HEAD (verify with `git merge-base --is-ancestor <baseline-hash> HEAD`; non-zero exit = unreachable), the prior worktree was removed and the recorded state no longer matches the worktree branch. Treat this as a fresh restart: clear `results.tsv` to the header row, clear `checkpoints.jsonl`, reset `seed-tier.txt` to `INITIAL_SEED_TIER`, and proceed to Phase 1 (Baseline) as if no prior data existed. Document the reason in musings: `**STALE BASELINE**: Prior worktree removed; recorded baseline <hash> not reachable from new HEAD. Restarting from main.`
   - **Strategy state recovery** (when resuming a contiguous campaign): derive `consecutive_rejects` from the tail of `results.tsv` — count consecutive non-`ACCEPT`/non-`SUSPICIOUS_ACCEPT`/non-`BASELINE` statuses ending at the last row. Derive `total_accepts` from total `ACCEPT` + `SUSPICIOUS_ACCEPT` count. Default `strategy = "normal"` unless the most recent musings entry contains a `**STRATEGY SHIFT**: <name>` marker, in which case adopt that strategy. Long campaigns where session continuity cannot be assumed should rely on this recovery path rather than agent mental tracking.
4. Identify the **mutable files** from program.md. If the mutable surface is a small set of files (<10), read each one into context. If the mutable surface is a directory tree (e.g., "all files under `packages/engine/src/`"), read only the files relevant to the current experiment hypothesis — the full tree is too large for context. Use profiling data and program.md's root causes to guide which files to read.
5. Identify the **root causes to seed** from program.md as the initial hypothesis queue.

#### Configuration

6. Read all configuration keys from program.md (see prerequisites reference). Apply defaults for any missing keys.
7. **Metric direction validation**: Read `METRIC_DIRECTION` from program.md (default: `lower-is-better`). Verify the accept/reject logic is consistent with this direction. **Hard error** if mismatched — do not proceed.
8. Read `MAX_ITERATIONS` from program.md (default: `unlimited`). Initialize `experiment_count = 0` (or resume from results.tsv row count).
9. Read `PRIMARY_METRIC_KEY` from program.md (default: `combined_duration_ms`).

#### State Initialization

10. Ensure `$WT/campaigns/<campaign>/musings.md` exists (create with `# Musings` header if missing). If results.tsv has only the header row AND musings.md does not contain a `**STRATEGY SHIFT**:`, `**CONTINUATION**:`, or `**STALE BASELINE**:` marker, clear musings.md to the header only — prior campaign history belongs in `campaigns/lessons-global.jsonl`. This applies on a fresh worktree creation OR after STALE BASELINE recovery in step 3, since both produce the same logical "fresh restart" state. The `**STALE BASELINE**:` marker is preserved (not cleared) when present because step 3 wrote it as a deliberate fresh-restart annotation; clearing it would defeat step 3's documentation step.
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

### Harness Preflight

Wrap every harness invocation with a cwd preflight check. Diagnostic / profiling commands routinely `cd` to scratch directories or the main repo, and the Bash session retains the new cwd silently; the harness script's `SCRIPT_DIR` / `PROJECT_ROOT` resolution then lands in the wrong tree without any error message. The preflight asserts the actual cwd and aborts before the harness wastes a build/gate cycle:

```bash
cd "$WT" || { echo "PREFLIGHT: $WT unreachable"; exit 1; }
[ "$(pwd)" = "$WT" ] || { echo "PREFLIGHT: cwd drift to $(pwd), aborting"; exit 1; }
bash campaigns/<campaign>/harness.sh
```

Apply this preflight at every harness call site: Phase 1 baseline (step 1 above), Step 4 EXECUTE in `references/harness-execution.md`, ceiling-baseline runs after a tier promotion or phase transition, post-meta-review trial runs. The paren-subshell form `(cd "$WT" && bash campaigns/<campaign>/harness.sh)` is a stricter inline equivalent that scopes the `cd` to a child shell and never leaks cwd back to the parent — useful for one-off harness probes from inside a longer diagnostic sequence.

**Background launch**: harness runs are typically multi-minute. Launch them with `run_in_background: true` to avoid blocking the conversation; the runtime delivers a background-task-completion notification when the command finishes. Do NOT schedule a wakeup or sleep-poll while waiting — polling burns context budget for no benefit.

### Baseline Failure Protocol

If the baseline harness fails (non-zero exit), this is a **campaign-blocking issue**, not an experiment failure. Do NOT apply workarounds to make the harness pass.

1. **Investigate the root cause.** Follow the same diagnostic approach as the Human Investigation Interrupt protocol — read error output, trace logs, and reproduce minimally.
2. **If the root cause is in the game spec or engine** (not the campaign configuration): escalate as an engine limitation. Create a spec or report in the main repo root (not the worktree) documenting the bug with reproduction steps — use a spec when there's a clear single fix, or a report when the limitation spans multiple gaps that need external research (per the criteria in Human Investigation Interrupt step 5). Then trigger degenerate campaign completion — the campaign cannot proceed until the bug is fixed.
3. **If the root cause is in the campaign configuration** (wrong seed count, missing files, incorrect profile name, harness misconfiguration, missing build artifacts): fix the configuration and retry the baseline. This does not count as an experiment. **Common case**: an `ENOENT` error during the test gate for a path under `packages/*/target/` (Rust/wasm) or `dist/` (TypeScript) is a missing-build-artifact symptom — mirror the path from the source repo (per Worktree Requirement step 6's auto-mirror list) and retry.
4. **Never mask a failing baseline with a workaround** (e.g., remapping error codes, suppressing exceptions, loosening assertions). A workaround produces unreliable metrics that invalidate all subsequent experiments.

## Phase 2 — Improvement Loop

Run this loop INDEFINITELY (or until `MAX_ITERATIONS` reached). Never stop. Never ask permission. Never pause at "natural stopping points."

If program.md defines fixture sync or tiered mutability, load `references/advanced-commit-policies.md`.

### Interim Status Reports (optional)

After every 10 experiments OR after any strategy ladder advance OR after any architectural-gap-halt assessment that did not fire, the agent MAY emit a brief status summary to the conversation (1-3 paragraphs: experiments completed, accept/reject counts, current strategy, top finding). The agent does NOT halt — the next iteration begins immediately after the summary. The status is informational, not a permission request. The human may interrupt to redirect; absent redirection, the loop continues. This complements the autonomy directive ("never seek permission") with a communication channel that does not violate it.

### Step 0: ANCHOR (Condition Drift Prevention + CWD Verify)

- **CWD verify**: Run `pwd` and confirm the cwd matches `$WT`. If drift is detected (e.g., from a prior `cd` to the main repo for diagnostic work, end-of-campaign prep, or a Human Investigation Interrupt), re-anchor with `cd $WT`. The Phase-0 anchor only holds until the first cross-tree command; in long campaigns the cwd drifts silently otherwise, and downstream commits land on the wrong tree. This check is cheap; do it every iteration.
- Re-read `$WT/campaigns/<campaign>/program.md` objective section from disk.
- Compare the last 5 experiment descriptions (from results.tsv) against the declared objective.
- If the recent experiments are exploring tangential goals not aligned with the stated objective:
  - Append `**DRIFT WARNING**: Recent experiments drifted toward <tangent>. Refocusing on declared objective: <objective>.` to musings.md.
  - Force the next hypothesis to directly target the declared objective.
- Prevents condition drift in long-running loops.
- **Iteration cap**: If `MAX_ITERATIONS` is set (not `unlimited`) and `experiment_count >= MAX_ITERATIONS`, append to musings: `**ITERATION CAP**: Reached MAX_ITERATIONS (${MAX_ITERATIONS}). Exiting loop gracefully.` Exit the loop and proceed to "After Campaign Completes."

### Step 0.5: USER PREAMBLE HONORING

If the invocation includes preamble directives that constrain or modify the autonomy directive (custom halt conditions such as "stop and report if you discover architectural gaps", prioritized hypotheses, file-avoidance, verification requirements, lesson-staleness flags), parse and honor them — they take precedence over the default "Run this loop INDEFINITELY... Never stop. Never ask permission." stance for this campaign only.

On the first iteration only:
1. Identify each directive in the preamble. Quote it verbatim in musings under a `**USER DIRECTIVES**:` heading on the first ANCHOR entry.
2. Map each halt-style directive to the closest existing trigger so the loop's procedural machinery applies:
   - "halt and report if X is discovered" → Step 1g (Ceiling Detection) handoff with the discovery as the ceiling cause; OR Step 7.7 (Architectural-Gap Halt) if the discovery is engine-ignores-flag-shaped.
   - "investigate before continuing" / "stop on Y" → Human Investigation Interrupt protocol.
   - "verify Z with proof" → DIAGNOSE (Step 1b) requirement; treat as a precondition before forming experiment hypotheses.
3. Map each constraint-style directive (avoid file Y, prefer hypothesis class X, treat lesson L as stale) to the relevant skill section:
   - File-avoidance → Step 3 IMPLEMENT scope check (extend the immutable list with the user's avoided files for this campaign).
   - Prioritized hypothesis → Step 2 HYPOTHESIZE (treat as a top-priority root cause to seed, ahead of UCB1 selection on the first iteration).
   - Lesson-staleness flag → Step 12 of Phase 0 (treat the flagged lessons as hypotheses to verify with trace evidence rather than established facts) and persist a `type: negative` lesson if verified stale.

Document each mapping inline in the first ANCHOR musings entry so subsequent iterations can find them. On every ANCHOR after the first, re-check whether any directive has triggered (e.g., the experiment surfaced the architectural gap the user asked about) and act accordingly.

### Step 1a: REFRESH (Correctness)

- Re-read mutable files **from disk** (not from stale context). This ensures each iteration operates on fresh state. If the mutable surface is a directory tree, re-read only the specific files modified in the previous experiment. If no experiment has run yet, read the files identified by profiling as hot paths.
- Verify that no immutable files have been modified since baseline. If any have, **hard error** — abort the loop.
- Review experiment history in results.tsv — what's been tried, what worked, what failed.
- Note the current `best_metric` and cumulative `lines_delta`.

### Step 1b: DIAGNOSE (Decision Landscape)

**Precondition gate**: If `consecutive_zero_effects >= ZERO_EFFECT_THRESHOLD`, the **mandatory triggers** branch fires regardless of other conditions. The diagnostic protocol output (per the OBSERVE Phase Protocol or generic fallback below) MUST be appended to musings as `## DIAGNOSE-after-zero-effects-exp-NNN` BEFORE any Step 2 hypothesis is generated. Without the recorded diagnostic header in musings, the iteration is incomplete — the agent must not proceed to Step 2. Informal in-conversation diagnostics do not satisfy this gate; the recorded musings entry is the contract.

**Mandatory triggers** — run the full diagnostic when ANY of these apply:
- First iteration at a new tier or phase
- After `ZERO_EFFECT_THRESHOLD` (default 3) consecutive zero-effect experiments
- Every `PIVOT_CHECK_INTERVAL` experiments

**Diagnostic protocol**:
1. Read trace/diagnostic artifacts produced by the harness (traces, logs, profiles).
2. If the campaign's program.md defines an **OBSERVE Phase Protocol**, follow its campaign-specific diagnostic steps (e.g., decision classification rules, trace parsing format, what to extract from per-seed traces). The OBSERVE protocol is the campaign's domain-specific diagnostic — the skill does not hardcode game-specific classification logic.
3. If no OBSERVE protocol is defined, apply a generic diagnostic: identify the evolved system's decision points, count tied decisions (score gap < 0.001), and record a summary in musings.
4. Record the diagnostic summary in musings (whatever the protocol produces).

**Verification gate (before acting on a trace finding)**: when a diagnostic reading would imply an architectural problem (preview broken, picks counter-game-theoretical, signal direction inverted, agent ignoring a config flag) or a strategy change, verify the interpretation by re-reading the canonical source fields BEFORE acting. Trace summaries (utility, range, count, breakdown stats) are derived; the canonical fields are the source of truth — for example, `selectedX` rather than `candidates[0].X`, the full per-candidate score breakdown rather than aggregate stats. If practical, run a controlled comparison experiment that should produce a known-different result; outcome divergence confirms the interpretation. The cost of one verification round is small; the cost of a misclassified architectural-gap halt or a retracted finding is high.

**When NOT triggered**: read diagnostic artifacts if the harness produces them to inform hypothesis generation. This lighter-weight observation is always appropriate but does not replace the full diagnostic at trigger points.

**Profile-first heuristic** (applies whenever Step 1b is entered): if the campaign's `PRIMARY_METRIC_KEY` is a duration / wall-time metric (matches `*_ms`, `*_duration_*`, or composite scores that include a wall-time component) AND the campaign's `program.md` mentions profiling (any of: `perf record`, `--prof`, `profiler`, "Profiling tool hierarchy"), invoke the profiler in iteration 1 BEFORE forming the first hypothesis. Code-reading guesses for bottleneck location systematically miss V8 deopt patterns, inline-cache costs, and escape-analyzed allocations that only profiles surface. Burning early experiments on hypothesis-driven micro-optimizations risks accept→V8-deopt→reject cycles; profile-driven hypotheses skip the cycle.

**Profile freshness**: if the prior iteration was a REJECT with kernel-internal or compiled-output changes, run the project's compile step (e.g., `pnpm -F @ludoforge/engine build`) BEFORE re-profiling. Profilers attribute time to symbols in the loaded compiled output (typically `dist/` or `build/`), not the source — stale compiled output shows symbols from the just-rolled-back diff and misleads the next hypothesis.

**CWD discipline during diagnostics**: profiling and diagnostic commands (`node --prof`, `cd /tmp/<scratch>`, source greps that descend out of the worktree) routinely change the Bash session's cwd silently. The Step 0 ANCHOR catches drift on the next loop iteration but does NOT catch drift mid-iteration. Re-anchor with `cd "$WT"` AFTER any diagnostic command that crosses tree boundaries, BEFORE the next `bash campaigns/<campaign>/harness.sh` invocation. The Phase 1 Harness Preflight pattern is the canonical guard.

### Steps 1c-1g: STRATEGY MANAGEMENT

**Per-iteration mandatory**: each iteration recomputes (a) `consecutive_rejects` from results.tsv tail; (b) current `strategy` (advance ladder if PLATEAU_THRESHOLD reached). UCB1 scores per category (Step 1d) are mandatory only once any category has ≥2 attempts AND strategy is currently `normal`. Before that threshold, hypothesis selection in normal mode may draw from the "root causes to seed" list in program.md order, then opportunistic user-flagged hypotheses, without formal UCB1 ranking. Skip-on-context-pressure is forbidden for the (a)/(b) state; strategy state lives in results.tsv, not in agent memory. The strategy ladder (`normal → combine → ablation → radical → backtrack`) is the loop's core operational logic; ad-hoc hypothesis generation outside this ladder while `consecutive_rejects >= PLATEAU_THRESHOLD` is improvisation, not normal mode.

Load `references/strategy-management.md`. Execute Steps 1c through 1g as described there.

### Step 1h: META-REVIEW

If `meta_improvement: true` in program.md, load `references/meta-review.md`.

### Step 2: HYPOTHESIZE

- **Check for human override first:** Does `$WT/campaigns/<campaign>/next-idea.md` exist?
  - If yes: read its contents as the hypothesis. Rename to `next-idea.used-exp-NNN.md`. Skip normal generation.
  - If no: proceed with normal hypothesis generation below.

- **Mid-campaign conversational user nudges:** A question or concern typed by the user during the loop (e.g., "are events being played?", "I'm worried about X") MAY be treated as equivalent to `next-idea.md` content. Parse the nudge into a concrete testable hypothesis and proceed; this elevates the user's input to authoritative-directive status for the next iteration. Quote the nudge verbatim in the corresponding Step 2.5 RECORD HYPOTHESIS musings entry under a `**USER NUDGE**:` line so it's discoverable on resume. Skip the elevation when the user's input is clearly a clarifying question without an implicit hypothesis (e.g., "what's the current best metric?") — answer in conversation and continue normal generation.

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
- **Fixture sync**: If `$WT/campaigns/<campaign>/sync-fixtures.sh` exists, run it now (after implementing changes, before executing the harness). **Build prerequisite**: if `sync-fixtures.sh` reads from compiled output (e.g., paths under `packages/<pkg>/dist/` or any `await import('.../dist/...')` calls), run the project's build step BEFORE `sync-fixtures.sh` — the harness's own internal build runs AFTER fixture regeneration and is too late, so fixtures regenerated against stale `dist/` will mismatch the harness's freshly-compiled output. Canonical sequence: `build → sync-fixtures → harness`.
  ```bash
  cd $WT && pnpm -F @ludoforge/engine build  # if sync-fixtures depends on dist/
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

**Status selection guidance**:
- `ACCEPT` / `SUSPICIOUS_ACCEPT`: metric improved past the program.md acceptance gate.
- `REJECT`: metric regressed beyond `NOISE_TOLERANCE`, or metric was within-noise without a simplification (lines_delta ≥ 0).
- `NEAR_MISS`: metric within `NOISE_TOLERANCE` of best AND `lines_delta >= 0`; stash for combine strategy.
- `EARLY_ABORT`: harness was killed mid-run for exceeding `ABORT_THRESHOLD`.
- `CRASH`: harness exited non-zero (build/gate/runner failure) OR a test asserted incorrectly. Use `CRASH` for both retryable trivial errors AND for un-retryable correctness failures (e.g., a determinism test caught that the diff broke an invariant). The 3-retry policy in Git Operations Summary applies to TRIVIAL crashes only — for un-retryable correctness CRASH the row's `metric_value` column is `null` (write the literal `null`) since no measurement was produced; the `description` column names the failing test or assertion.
- `BACKTRACK`: marker row written by the BACKTRACK strategy; metric is the checkpoint's metric, lines_delta is `0`.

Use a sequential experiment ID: `exp-001`, `exp-002`, etc. (continue from where results.tsv left off).

**IMPORTANT**: After logging results.tsv, ALWAYS proceed to Step 7.5 (musings) then Step 7.6 (lesson extraction). Do not skip to Step 8.

### Step 7.5: RECORD LEARNING (Structured Reflection)

Append to `$WT/campaigns/<campaign>/musings.md`:
```markdown
**Result**: <status> (<old_metric> -> <new_metric>, noise_floor: X%)
**Partial signals**: <if any intermediate metrics showed directional improvement/regression>
**Learning**: <what was learned — confirmed/refuted hypothesis, surprising observations, what to try differently>
```

**Tracked-musings commit prohibition**: If `musings.md` is tracked in this campaign (verify with `git check-ignore campaigns/<campaign>/musings.md` per Worktree Requirement step 6), append in-place but do NOT include `musings.md` in the experiment's commit. The worktree branch's tracked `musings.md` content must remain at the main-baseline state until the campaign completes; session extensions are extracted to `lessons-global.jsonl` per the After Campaign Completes protocol, with the working-tree changes reverted at squash-merge time. Including `musings.md` in `improve-loop: exp-NNN ...` commits pollutes the eventual squash-merge to main with the running session narrative and forces a retroactive revert (see After Campaign Completes step 4 for the cleanup procedure if this prohibition was violated). For gitignored campaigns, append freely — the file never enters the squash-merge file set.

**On `SUSPICIOUS_ACCEPT` only**, extend the template with a Suspicion-gate verification block:
```markdown
**Suspicion-gate verification** (improvement >MAX_IMPROVEMENT_PCT triggered SUSPICIOUS_ACCEPT):
- Mechanism: <numbered list of work skipped or restructured that explains the magnitude>
- Determinism witness: <state_hash / outcome counts / corpus-shape fingerprint preserved vs baseline>
- Watchdog status: <Goodhart-guard reading vs threshold>
- Plausibility judgment: ACCEPT (mechanism matches measured gain) | REJECT (gain too large for stated mechanism)
```
The judgment is the agent's mechanistic audit of WHY the gain is so large. If no plausible mechanism explains the magnitude, re-classify as REJECT and roll back per Step 6.

**V8 JIT deopt pattern detection**: If 3+ consecutive rejects show measured regressions (not within-noise, but slowdowns >1%) with root causes attributable to V8 JIT deoptimization (object shape changes, closure body modifications, hidden class mutations, WeakMap/caching overhead in kernel execution paths), flag as `**V8 JIT CEILING**` in musings. Skip directly to ceiling report with architectural spec or report creation (Option D in Step 1g). Further micro-optimization experiments are provably futile — the architecture must change. This pattern is distinct from a normal plateau (where experiments are within noise) — V8 deopt regressions are ACTIVE performance degradation, not just failure to improve.

**Zero-effect detection**: If the evolved system's trace is functionally identical to the previous experiment, flag as `**ZERO-EFFECT**` in the musings entry. For agent evolution campaigns, compare the evolved seat's move sequence (actionIds in order) and final margin from the trace files. Byte-level trace comparison is too strict (timestamps, intermediate scores may differ); compare the decision-relevant fields only. For non-agent campaigns, compare the primary metric output and any trace summary the harness produces. **An ACCEPT that produces an identical decision-relevant trace IS a zero-effect ACCEPT — increment the counter.** Lines-delta change (e.g., a simplification ACCEPT that removes dead-weight code without altering selections) does NOT count as a "non-zero-effect" reset; only experiments that change the evolved system's decision trace reset `consecutive_zero_effects`. Increment `consecutive_zero_effects` (reset on any non-zero-effect experiment, regardless of ACCEPT/REJECT classification). After `ZERO_EFFECT_THRESHOLD` (default 3) consecutive zero-effect experiments, the next iteration's Step 1b DIAGNOSE becomes mandatory — the hypothesis space is misaligned with the actual decision landscape. Zero-effect means the targeted decisions already have large score gaps; look for decisions with small gaps instead.

### Step 7.6: EXTRACT LESSON

Load `references/lesson-management.md`. Execute the curation gate and lesson extraction as described there.

### Step 7.7: ARCHITECTURAL-GAP HALT

Trigger this step before Step 8 (REPEAT) when the just-completed experiment surfaces an engine/runtime/DSL gap rather than a campaign-mutable-surface limitation. This is the agent-initiated counterpart to the Human Investigation Interrupt's engine-limitation discovery (step 5 of that protocol) and to Step 1g's Ceiling Detection — but it can fire after a single experiment, without waiting for `CEILING_THRESHOLD` non-accepts, when the evidence is definitive. This step operationalizes Foundation 15 (Architectural Completeness): silent no-ops, partial-coverage gaps, and documented-but-non-functional capabilities are root-cause issues that must be reported as specs or reports rather than worked around.

**Trigger conditions** (any one is sufficient):
1. The experiment's REJECT is caused by the engine *ignoring* a config flag the compiler validated (compile accepts → runtime no-ops). Diagnostic: a YAML opt-in produced no behavioral change, AND a trace inspection plus a grep across `packages/<pkg>/src/` shows the relevant runtime code path is missing or returns early.
2. An experiment's trace reveals a documented capability (cookbook-listed, spec-promised, or referenced in another integration) that is non-functional under default settings — i.e., the docs and the runtime disagree.
3. A user-preamble directive (Step 0.5) explicitly mapped a discovery class to "halt and report" and the experiment matches that class.
4. **Partial coverage** — a documented capability is functional for some inputs but silently non-functional for others, AND the documentation does not warn about the partial coverage. Examples: a preview ref that resolves at most decisions but produces empty signal at a meaningful fraction; a config flag that takes effect on small inputs but is silently bounded by a static cap on larger ones; a feature whose cookbook framing is universal but whose implementation has a depth or size ceiling that operators authoring against the cookbook would not anticipate. When in doubt at a borderline trigger, default to invoking Step 7.7 — the cost of writing a report when one wasn't strictly needed is low; the cost of skipping a real gap is high. The asymmetry favors over-reporting at borderline triggers.

**On trigger**:
1. Classify the just-completed experiment per the normal Step 7 LOG status (typically `REJECT`, occasionally `CRASH`); the architectural-gap halt does NOT change the experiment's classification — it is an additional pause-and-report decision after the experiment is logged.
2. Write a report (`reports/<topic>-<date>.md`) or spec (`specs/<NNN>-<name>.md`) in the main repo root (not the worktree). Use the same spec-vs-report criterion from Human Investigation Interrupt step 5 (single clear fix → spec; multi-gap research → report). The artifact MUST include:
   - **Symptom** — the YAML opt-in / config / docs claim that should have worked, and the trace evidence of the no-op or divergence (per-decision excerpts, not just summaries).
   - **Source-code citations** — file paths and line numbers for the missing wiring, the unused implementation, the validated-but-ignored config field. Run grep to confirm zero non-test callers if you suspect dead-end code.
   - **Ticket archaeology** — if the gap traces to a deferred ticket (Out-of-Scope notes that say "follows the same pattern" but never landed), cite the ticket file path and the deferral text.
   - **Adjacent concerns** — anything else surfaced during the audit that is suspicious but not the primary gap (e.g., a fallback semantic that may also be misbehaving). Flag uncertainty explicitly.
   - **Proposed fix** — concrete implementation plan with alternatives compared. Cite the foundations the fix must respect.
3. Append to musings: `**ARCHITECTURAL-GAP HALT**: <one-line summary>. See <report or spec path>. Halting at exp-NNN.`
4. Append to results.tsv: `arch-gap-NNN	<best_metric>	0	architectural-gap	REJECT	architectural gap discovered at exp-NNN; see <artifact path>` (this is a marker row similar to ceiling-NNN, not a new experiment).
5. **Pause for human input**: Present the artifact to the user with the same options as Step 1g Ceiling Detection (continue with workaround, halt the campaign, or pursue the spec/report). Do NOT proceed to Step 8 (REPEAT) until the human directs.

**Dialogue-active variant**: When the user is actively engaged in dialogue (Human Investigation Interrupt active, or recent conversational input within the past few turns), it is acceptable to summarize the gap in conversation FIRST and write the report AFTER the user confirms scope. The autonomous write-then-pause ordering above (steps 2-5) is the default for unattended-loop discoveries; the dialogue-active variant prevents an over-broad or off-scope report from being written and then re-scoped. The musings and results.tsv entries (steps 3-4) still land before resuming, even in the dialogue-active variant.

If the trigger conditions do NOT apply, skip this step and proceed to Step 8 (REPEAT) normally.

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

`results.tsv`, `checkpoints.jsonl`, `lessons.jsonl`, `intermediates.jsonl`, and `run.log` are untracked (gitignored) — they persist across accepts and rejects but are not committed. `musings.md` may be tracked or gitignored depending on campaign setup; verify with `git check-ignore campaigns/<campaign>/musings.md` before any cross-tree copy or commit decision. **When `musings.md` is tracked, the running-session extensions written at Step 7.5 RECORD LEARNING MUST be excluded from experiment commits** — see Step 7.5's tracked-musings commit prohibition and the After Campaign Completes section for the full rationale.

**Infrastructure commits outside experiments**: Tier 3 (observability) and campaign infrastructure changes (trace improvements, harness updates, documentation) can be committed at any point during the OBSERVE phase, not only during the IMPLEMENT->DECIDE cycle. Use commit messages prefixed with `infra:` and log in musings, but do NOT log in results.tsv (they are not experiments).

**Exception**: `campaigns/lessons-global.jsonl` is NOT gitignored — it MUST be committed during campaign completion (see below).

## After Campaign Completes

When the human decides to stop the loop (or `MAX_ITERATIONS` is reached):

**Degenerate campaign** (zero accepted experiments — only infrastructure commits or early halt due to a discovered bug/limitation): simplify the completion flow:
1. Create specs or reports if engine limitations were discovered (in the main repo root, not the worktree). Use the spec/report criterion from Human Investigation Interrupt step 5.
2. Copy gitignored runtime files back to the source campaign folder (see step 4 below). The musings.md from a degenerate campaign contains diagnostic history (investigation notes, baseline analysis, root cause findings) that may be valuable when the campaign is restarted after the blocking issue is resolved — preserve it. **If `musings.md` is tracked in this campaign**, do not blindly overwrite the main repo's committed version; either skip the copy or merge intentionally (the main repo's tracked musings may have been deliberately edited or truncated by the user).
3. **Pre-merge check**: Verify the branch has commits worth keeping: `git diff main...improve/<campaign> --stat`. If no meaningful diff remains (all changes were reverted in the working tree, or only invalid/diagnostic commits exist), skip the squash-merge and proceed directly to step 5.
4. If the branch has useful infrastructure commits OR `campaigns/lessons-global.jsonl` has been modified during this campaign (e.g., a `type: negative` correction obsoleting a prior global lesson, or any other infrastructure-shaped lesson update): switch to the main repo root and squash-merge. **If `lessons-global.jsonl` was modified, commit it on the worktree branch first per the normal-flow step 3** (`git add -f campaigns/lessons-global.jsonl && git commit -m "chore: promote global lessons from <campaign>"`) so the squash-merge picks it up. Commit the squash-merge with a summary noting the campaign was halted due to `<reason>` and listing infrastructure changes. The "skip lesson promotion" guidance applies to forward-looking ACCEPT-driven lesson promotion only; retroactive corrections to `lessons-global.jsonl` persist regardless of campaign outcome. Skip the metric impact summary.
5. Remove the worktree and delete the branch (step 9 below).

**Normal campaign** (one or more accepted experiments):

This sequence crosses between the worktree and the main repo. Each step is annotated with its required cwd. **Verify with `pwd` after every cwd switch** — the Phase-0 anchor does not survive cross-tree work, and the lessons commit landing in the wrong tree is a known pitfall.

**Spec/report creation timing — three options referenced by steps 7 and 8 below:**
- **(a)** During a Human Investigation Interrupt (handled in the Human Investigation Interrupt section, not this sequence).
- **(b)** Between user-directed campaign halt and squash-merge — created BEFORE step 7's squash-merge commit, referenced by file path (or commit hash) in the squash-merge commit message.
- **(c)** Post-merge as a follow-up — created AFTER step 7's squash-merge commit, as a separate commit on main.

Step 8 below elaborates on the spec-vs-report decision criterion. Both step 7 and step 8 reference these options by letter; the preamble lets the reader resolve the (a)/(b)/(c) labels without forward-looking through the sequence.

1. Review the worktree branch: `git log --oneline` shows all accepted improvements. *(cwd: worktree)*
2. Promote high-confidence lessons to global store (if not already done by Step 7.6 — apply the same `confidence >= 0.8 AND decay_weight >= 0.5` filter from `references/lesson-management.md` and skip duplicates by lesson text). *(cwd: worktree — append to the worktree's `campaigns/lessons-global.jsonl`)*
3. **Commit `campaigns/lessons-global.jsonl`** *(cwd: worktree, on the campaign branch — verify with `pwd` and `git branch --show-current` before staging)*:
   ```bash
   cd $WT && pwd  # must show worktree path
   git branch --show-current  # must show improve/<campaign>
   git add -f campaigns/lessons-global.jsonl
   git commit -m "chore: promote global lessons from <campaign>"
   ```
   This file persists across campaigns — without this commit, lessons are lost when the worktree is removed. The squash-merge in step 5 picks up this commit; landing it on main directly bypasses that path and leaves the worktree branch missing the promotion.
4. **Preserve runtime files**: Copy gitignored campaign runtime files (`results.tsv`, `checkpoints.jsonl`, `lessons.jsonl`) from the worktree back to the source campaign folder in the main repo. These files are gitignored there too but persist on disk for future campaign resumption. Without this step, `git worktree remove` deletes the campaign's diagnostic history.

   **Ad-hoc diagnostic scripts** (e.g., `campaigns/<campaign>/diagnose-*.mjs`) created during a Human Investigation Interrupt: copy back to the main repo's campaign folder if they encode reusable investigation logic that may help re-investigate the same question in future campaigns. Let them be deleted by `git worktree remove --force` if they were one-off probes specific to this session. Many campaigns already have a `diagnose-*.mjs` convention to match — follow it where present.

   **For `musings.md`**: check whether it is tracked in your campaign first (`git check-ignore campaigns/<campaign>/musings.md`).

   - *If gitignored*: the worktree's session-extended musings can be copied back to the main repo's gitignored campaign-folder copy (this preserves diagnostic history for future campaign resumption without any tracking concerns).
   - *If tracked* (the campaign's musings.md is committed to git): do NOT overwrite the main repo's committed version on disk — the worktree's session-extended musings should either be discarded or appended only to the gitignored campaign-folder copy if one exists. The main repo's musings.md may have been deliberately truncated or edited by the user during a Human Investigation Interrupt and a blind copy would silently revert that.

     **Worktree-branch commit decision (tracked-musings only)**: do NOT commit session-extensions to the worktree branch either — the squash-merge would land them in main and pollute the user's clean musings header. Before the squash-merge, extract any substantive findings (architectural insights, multi-experiment narratives, validation evidence not already captured by RECORD LEARNING) into one of the durable channels:
     - `campaigns/lessons-global.jsonl` (typed lessons — `finding`, `architectural`, `negative`, etc., per `references/lesson-management.md`).
     - The report or spec being written (project-level artifacts; see steps 7-8).
     - The squash-merge commit message itself (when the finding is short enough to inline).

     Then revert `musings.md` in the worktree to its main-baseline state before the squash-merge file-set preview. Two sub-cases:
     - *Session-extensions are still uncommitted in the working tree* (Step 7.5's tracked-musings commit prohibition was respected throughout): `cd $WT && git checkout -- campaigns/<campaign>/musings.md` reverts the working tree to HEAD's content, which matches main.
     - *Session-extensions were committed during the campaign* (legacy campaigns, or amid-protocol violation): the HEAD of the worktree branch carries the extensions, so reverting to HEAD won't help. Source the revert from main and commit it on the worktree branch: `cd $WT && git checkout main -- campaigns/<campaign>/musings.md && git commit -m "chore: revert tracked musings.md to main baseline (session findings preserved in reports/ and lessons-global.jsonl)"`. The revert commit will be folded into the squash-merge.

     **Confirm before squash-merge**: substantive findings preserved outside musings.md? If yes, proceed. If no, route them through one of the durable channels first, then revert.

   *(no cwd change required; uses absolute paths)*
5. Switch to the main repo root (NOT the worktree) and squash-merge. **Preview the squash-merge file set first** with a merge-base diff — confirm only the intended files appear. If `main` has commits since the worktree was created (a parallel commit from the user, e.g., a report or spec written directly to main while the loop was running), the squash-merge applies only the worktree branch's diff vs the merge-base, but the human reviewer should still verify the file list matches expectations before committing. The bidirectional `git diff main improve/<campaign>` mixes both directions and is misleading here — always use the explicit merge-base form.
   ```bash
   cd <main-repo-root> && pwd  # verify cwd is main, not worktree
   git diff --stat $(git merge-base main improve/<campaign>) improve/<campaign>
   git merge --squash improve/<campaign>
   ```
6. If `sync-fixtures.sh` exists, run it after the squash-merge (before committing) to ensure fixtures match the merged state. After running sync-fixtures.sh, stage any newly modified fixtures with `git add` (e.g., `git add packages/engine/test/fixtures/` or the campaign's relevant fixture path) — the squash-merge file set may not include all fixtures that sync-fixtures regenerates from the merged profile state, especially when the merged profile change cascades across multiple golden fixtures. Verify with a quick build+test. *(cwd: main repo root)*
7. **Spec/report timing branch**: if the user has directed pre-merge spec or report creation (timing option (b) in step 8 below), execute step 8's artifact creation BEFORE this commit step, and reference the new spec/report file paths (or their commit hashes if committed separately) in the squash-merge message. Otherwise commit the squash-merge first and create the spec or report as a separate post-merge commit per timing option (c). Commit the squash-merge with a summary message listing: (a) key infrastructure fixes, (b) policy/mutable file changes with metric impact, (c) lesson count promoted, (d) test changes, (e) any pre-merge specs or reports referenced. The detailed experiment history lives in musings.md and results.tsv (typically gitignored — `musings.md` may be tracked depending on campaign setup). *(cwd: main repo root)*
8. **Spec/report triage**: Review the ceiling report and musings for engine limitations, DSL gaps, or infrastructure needs discovered during the campaign. Decide between a spec (`specs/<NNN>-<name>.md` — clear single fix, project ready to commit to it) or a report (`reports/<topic>-<date>.md` — limitation spans multiple gaps that need external research before settling on specs); see Human Investigation Interrupt step 5 for the same criterion. Spec/report creation can happen at any of three points: (a) during a Human Investigation Interrupt, (b) between user-directed campaign halt and squash-merge (e.g., user says "write the report, then squash-merge"), or (c) post-merge as a follow-up. In all three cases, specs and reports are project-level artifacts — create them in the main repo root (not the worktree) as a separate commit; the squash-merge does not include them. If a spec or report already exists when reaching this step, reference it in the squash-merge commit message but skip creation. *(cwd: main repo root)*
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
5. **Engine limitation discovery**: If the investigation reveals an engine/DSL/runtime limitation (not a campaign design issue), document it. Two artifact options:
   - **(a) spec** (in main repo `specs/<NNN>-<name>.md`) — when the limitation has a clear single fix and the project is ready to commit to it.
   - **(b) report** (in main repo `reports/<topic>-<date>.md`) — when the limitation spans multiple gaps that need external research or a brainstorm before settling on specs. Reports gather evidence, frame open research questions, and propose solution directions, but stop short of committing the project to a specific design. The user may direct which artifact type. After writing a report, the typical follow-up is to halt the campaign and convert findings into specs once the research narrows the design space.

   Adjust the campaign approach to work within the limitation. Log in musings: `**ENGINE LIMITATION**: <description>. See Spec NNN` or `See Report <path>`.
6. **Bug fix during investigation**: If the investigation reveals a code bug or a game-spec encoding bug (not a policy/profile issue):
   1. Implement the fix in engine code or game-spec data files (e.g., `data/games/<game>/`).
   2. Run the full test suite.
   3. Commit with a descriptive message (use `fix:` prefix, not `infra:`).
   4. If the fix changes compiled output, run `sync-fixtures.sh` and commit fixture updates separately.
   5. Re-run the harness to establish the post-fix baseline.
   5b. **Validate prior accept/reject decisions against the post-fix baseline**: When the bug fix changes the meaning of prior measurements (e.g., a game-rules fix changes which seeds are winnable, an engine fix changes which optimizations are valid), treat as STALE BASELINE per Phase 0 step 3 — clear `results.tsv` to header, clear `checkpoints.jsonl`, document the reset in musings with reasoning. Prior commits on the worktree branch remain (preserving history); whether they remain relevant to the new baseline depends on whether the change in question still helps post-fix. Resume experiment numbering from `exp-001` in the post-fix regime. Existing per-campaign `lessons.jsonl` entries are preserved as observations but their accept/reject classifications may need re-derivation. Skip this step when the bug fix changes only execution speed or trace fidelity (not the semantic meaning of game outcomes).
   6. Update `best_metric` if the baseline changed.
   7. Log the fix in musings with `**BUG FIX**:` prefix.
   8. This counts as "unlocked new capabilities" — reset `consecutive_rejects = 0` and `strategy = "normal"`.

## Guardrails

These rules are unique to this section; all other constraints are defined inline in their respective workflow steps.

- **Never weaken assertions** — the tests must remain equally rigorous.
- **Never add dependencies** — optimize with what's available.
- **Profile-coupled tests**: If a test fails because the evolved profile changed the game trajectory (not because the code is broken), this is a profile-coupling issue, not a code bug. Fix the test to be resilient to profile evolution: (a) use search-based witnesses instead of hardcoded seed/ply pairs, (b) use regex matching for consideration term names instead of exact string lists, (c) widen search bounds for witness finding, (d) deduplicate when programmatically extending a base profile's lists (e.g., `use.considerations`, `plan.considerations`) — the base may already contain the term being added by a campaign experiment, so guard with `baseProfile.use.considerations.includes(CONSIDERATION_ID) ? base : [...base, ID]`. Commit test decoupling as `infra:` independent of the experiment. Does NOT count toward the 3-retry CRASH limit.
