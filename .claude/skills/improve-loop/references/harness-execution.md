# Harness Execution and Measurement

## Metric Direction Comparison Helpers

All comparisons in Steps 4-6 MUST respect `METRIC_DIRECTION`:

| Operation | `lower-is-better` | `higher-is-better` |
|-----------|--------------------|--------------------|
| improved | `new_metric < best_metric` | `new_metric > best_metric` |
| worsened | `new_metric > best_metric` | `new_metric < best_metric` |
| early_abort | `running > best_metric * (1 + ABORT_THRESHOLD)` | `running < best_metric * (1 - ABORT_THRESHOLD)` |
| best_checkpoint | lowest `metric` value | highest `metric` value |
| improvement_pct | `(best_metric - new_metric) / best_metric * 100` | `(new_metric - best_metric) / best_metric * 100` |

Apply these consistently throughout. Never hardcode a comparison direction.

## Step 4: EXECUTE

- Read `HARNESS_RUNS` from program.md (default: 1).
- **Fixture sync**: If `$WT/campaigns/<campaign>/sync-fixtures.sh` exists, run it before the harness to prevent stale-fixture CRASH failures:
  ```bash
  cd $WT && bash campaigns/<campaign>/sync-fixtures.sh
  ```
- Run the harness:
  ```bash
  cd $WT && bash campaigns/<campaign>/harness.sh
  ```

**Early abort (per-run):** If the harness supports intermediate output (one line per target file), parse after each line. If the running metric value is worse than `best_metric` by more than `ABORT_THRESHOLD` (using the Metric Direction Comparison Helpers above), kill the harness process. Log status as `EARLY_ABORT` and REJECT immediately (skip to Step 7).

**Intermediate metric capture:** While parsing intermediate output for early abort, also record each checkpoint's label and metric value for `intermediates.jsonl` (see Step 5).

**Multi-run averaging with MAD:** If `HARNESS_RUNS > 1`:
  - Run the harness N times, collecting all primary metric values.
  - Early abort still applies per-run (abort any single run that's clearly losing).
  - Compute **median** as the metric for the accept/reject decision.
  - Compute **MAD** (Median Absolute Deviation):
    ```
    MAD = median(|x_i - median(x)|) for all runs
    normalized_MAD = 1.4826 * MAD
    noise_floor = normalized_MAD / median(x) * 100  (as percentage)
    ```
  - If `spread (max - min) > 3 * normalized_MAD`: flag as "unstable measurement" in musings, add tiebreaker runs up to `MIN_CONFIDENCE_RUNS`.
  - Report `noise_floor` alongside metric in the log description.

**Single-run noise floor:** If `HARNESS_RUNS == 1`, noise floor cannot be computed. The agent relies on the `NOISE_TOLERANCE` config value (default 1%) as the assumed noise floor.

## Step 4d: GOODHART CHECK

After a successful harness run (non-crash, non-abort), apply these guards:

**Multi-seed evaluation (if `HARNESS_SEEDS > 1`):**
- Re-run the harness with env var `HARNESS_SEED=N` for each additional seed (seeds 2 through `HARNESS_SEEDS`).
- Accept only if the improvement holds across ALL seeds (worst-case metric across all seeds must still beat `best_metric`).
- If any seed shows regression, classify as REJECT.

**Suspicion gate:**
- Compute `improvement_pct = (best_metric - new_metric) / best_metric * 100`.
- If `improvement_pct > MAX_IMPROVEMENT_PCT` (default 30%):
  - Log status as `SUSPICIOUS_ACCEPT` instead of `ACCEPT`.
  - Append to musings: `**WARNING**: Unusually large improvement (X%). Verify this is not metric gaming.`
  - The agent MUST attempt to explain WHY the improvement is so large before proceeding. If no plausible explanation, treat as REJECT.

**Periodic regression check:**
- Every `REGRESSION_CHECK_INTERVAL` accepts (tracked via `total_accepts` counter):
  - Re-run the harness WITHOUT any new changes.
  - If the measured metric has drifted from `best_metric` by more than `NOISE_TOLERANCE`:
    - Flag as "metric drift detected" in musings.
    - Update `best_metric` to the re-measured value (recalibrate).
    - Log: `regression-check-NNN	<measured_value>	0	regression	ACCEPT	metric recalibrated from <old_best> to <new_best>`

## Step 5: MEASURE

- Parse the primary metric (by `PRIMARY_METRIC_KEY`) from harness output (or median if multi-run).
- If harness exited non-zero or output is unparseable, treat as CRASH.
- Compute improvement: `improvement_pct = (best_metric - new_metric) / best_metric * 100`

**Intermediate metric parsing:**
- If the harness produced intermediate output lines (per-file or per-checkpoint), parse each one.
- Compare against the previous experiment's intermediates (from `intermediates.jsonl`).
- Identify **partial signals**: subsets where metrics improved vs. subsets where they regressed.
- Append to `$WT/campaigns/<campaign>/intermediates.jsonl`:
  ```json
  {"exp_id": "exp-NNN", "checkpoints": [{"label": "...", "metric": N}, ...], "primary_metric": N, "partial_signals": ["test-A improved 12%, test-B regressed 3%"]}
  ```
