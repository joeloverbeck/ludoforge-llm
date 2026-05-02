# Prerequisites and Configuration

## Campaign Folder Contents

- The campaign folder must contain:
  - `program.md` — instruction spec (objective, metrics, mutable/immutable files, accept/reject logic, experiment categories, thresholds)
  - `harness.sh` — executable evaluation harness (exits 0 on success, 1 on failure)
  - `results.tsv` — experiment log (at minimum, a header row; schema below)
- Optional campaign files:
  - `musings.md` — structured reflection log (created automatically if missing)
  - `next-idea.md` — human-provided hypothesis override (consumed and renamed after use)
  - `checks.sh` — correctness guard (tests, types, lint); blocks metric-improving changes that break correctness
  - `sync-fixtures.sh` — fixture synchronization script (see "Dependent Fixture Updates")

### results.tsv Schema

```
experiment_id	metric_value	lines_delta	category	status	description
```

The `metric_value` column holds the primary metric from the harness (identified by `PRIMARY_METRIC_KEY`). For clarity, use the `PRIMARY_METRIC_KEY` name as the column header (e.g., `compositeScore`) instead of the generic `metric_value`.

Status values: `ACCEPT`, `REJECT`, `NEAR_MISS`, `EARLY_ABORT`, `CRASH`, `SUSPICIOUS_ACCEPT`, `BACKTRACK`, `BASELINE`

`BASELINE` is reserved for tier/phase-transition baseline re-measurement rows (e.g., `tier-2-baseline`, `phase-B-baseline`). These rows record the new-tier metric value but are not experiments — downstream tooling treats `BASELINE` rows as reference points, not as accept/reject decisions. Use `BASELINE` only for entries logged as part of the phase-transition checklist in `references/accept-reject-logic.md`. The original `baseline` row written by Phase 1 also uses status `BASELINE` (replacing the prior `ACCEPT` convention) for consistency.

**Backward compatibility:** If resuming an old campaign whose results.tsv lacks the `category` column, treat all existing rows as having category `other` and continue with the new schema for new rows.

### Runtime Files (created automatically, untracked by git)

| File | Purpose |
|------|---------|
| `checkpoints.jsonl` | Named restore points for backtracking |
| `lessons.jsonl` | Per-campaign extracted lessons |
| `intermediates.jsonl` | Per-experiment intermediate metric breakdowns |
| `program.md.backup` | Meta-loop rollback snapshot |

### Persistent Cross-Campaign Files (MUST be committed)

| File | Purpose |
|------|---------|
| `campaigns/lessons-global.jsonl` | Cross-campaign promoted lessons — persists across campaigns and worktrees |

**IMPORTANT**: `campaigns/lessons-global.jsonl` is NOT a per-campaign runtime file.
It accumulates lessons across ALL campaigns and MUST be committed to the repo
(not gitignored) so it survives worktree removal and squash-merges. The "After
Campaign Completes" step explicitly commits this file.

### Configuration Keys (read from program.md, all have defaults)

| Key | Default | Purpose |
|-----|---------|---------|
| `ABORT_THRESHOLD` | 0.05 | Early abort if metric exceeds best by this fraction |
| `PLATEAU_THRESHOLD` | 5 | Consecutive rejects before strategy shift |
| `HARNESS_RUNS` | 1 | Number of harness runs per experiment (median taken) |
| `UCB_EXPLORATION_C` | 1.414 | UCB1 exploration constant (higher = more exploration) |
| `MIN_CONFIDENCE_RUNS` | `HARNESS_RUNS * 2` | Extra runs required when improvement is within noise floor |
| `HARNESS_SEEDS` | 1 | Multi-seed evaluation (1 = disabled) |
| `MAX_IMPROVEMENT_PCT` | 30 | Suspicion gate — flag improvements larger than this |
| `REGRESSION_CHECK_INTERVAL` | 5 | Re-verify metric stability every N accepts |
| `meta_improvement` | false | Enable self-improving program.md meta-loop |
| `META_REVIEW_INTERVAL` | 20 | Experiments between meta-reviews |
| `META_TRIAL_WINDOW` | 10 | Trial period for meta-changes |
| `NOISE_TOLERANCE` | 0.01 | Assumed noise floor for single-run campaigns (1% as decimal) |
| `PIVOT_CHECK_INTERVAL` | 10 | Experiments between PROCEED/REFINE/PIVOT checks |
| `METRIC_DIRECTION` | `lower-is-better` | Optimization direction (`lower-is-better` or `higher-is-better`) |
| `MAX_ITERATIONS` | `unlimited` | Hard cap on total experiments (graceful stop when reached) |
| `CHECKS_TIMEOUT` | 120 | Timeout in seconds for correctness checks (`checks.sh`) |
| `PRIMARY_METRIC_KEY` | `combined_duration_ms` | Key name to parse from harness output (e.g., `compositeScore`) |
| `ZERO_EFFECT_THRESHOLD` | 3 | Consecutive zero-effect experiments before mandatory diagnostic |
| `CEILING_THRESHOLD` | `2 * PLATEAU_THRESHOLD` | Consecutive non-accepts across ALL strategies before ceiling report |
