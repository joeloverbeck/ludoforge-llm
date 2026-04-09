# Accept/Reject Decision Logic

## Step 6: DECIDE

Apply the accept/reject logic from program.md. **If program.md defines its own accept/reject conditions** (thresholds, noise tolerance, complexity penalties), use those EXCLUSIVELY. The defaults below apply ONLY when program.md does not specify its own logic.

**Phase-dependent accept/reject logic**: Some campaigns define multiple evaluation phases with different accept/reject conditions (e.g., win-gated ramp-up followed by compositeScore optimization). When program.md defines phase transitions:
1. Follow the current phase's accept/reject logic exclusively
2. When a phase transition triggers (e.g., tier advance, seed count change), re-run the harness as a baseline for the new phase
3. Reset `best_metric` / `best_wins` / any phase-specific tracking variables to the new baseline values
4. Log the phase transition in musings: `**PHASE TRANSITION**: <old phase> → <new phase>. New baseline: <metric>.`
5. The transition itself is not an experiment — do not log it in results.tsv as an experiment row

**Multi-metric phase accept logic guidance**: When a ramp-up phase tracks both a primary count (e.g., wins) and a secondary continuous metric (e.g., avgMargin), the accept rule must handle the case where the primary count INCREASES but the secondary metric REGRESSES. Recommended two-case pattern:
- **Primary count increased**: Use the composite metric (e.g., `compositeScore`) as the arbiter. The composite already weights the count heavily (e.g., 10x per win). Accept if `new_compositeScore > best_compositeScore + NOISE_TOLERANCE`.
- **Primary count unchanged**: Use the secondary metric as the arbiter. Accept if secondary improved or if it's equal with lines_delta < 0 (simplification).

A flat AND rule (`wins >= best AND margin >= best - tolerance`) blocks clearly beneficial changes where an extra win (+10/N compositeScore) is gained at the cost of small margin regression. Campaign authors should use the two-case pattern to avoid this trap.

**CRASH/FAIL:**
- **Fixture sync crash**: Golden/snapshot test failure immediately after mutable file changes — follow "Dependent Fixture Updates" in `references/advanced-commit-policies.md`. Does NOT count toward the 3-retry limit.
- **Profile-coupled test crash**: Mutable profile change alters a game trajectory that an immutable test depends on (state-trajectory dependency, not fixture mismatch). Document in musings, commit the test fix as an infra commit (independent of experiment), re-attempt. Does NOT count toward the 3-retry limit. The test fix should decouple the test from profile evolution (e.g., replace agent-driven state setup with a serialized fixture).
- **Trivial error** (typo, missing import, off-by-one): fix and retry (up to 3 times).
- Otherwise: REJECT.

**EARLY_ABORT:**
- Already handled in Step 4. Log and continue.

**Noise floor check (MAD-based):**
- If `improvement_pct > 0` but `improvement_pct < noise_floor` (from MAD computation or `NOISE_TOLERANCE` if single-run):
  - The improvement is within measurement noise. Require `MIN_CONFIDENCE_RUNS` additional harness runs to confirm.
  - If confirmed after additional runs: proceed to ACCEPT evaluation.
  - If NOT confirmed (median shifts back): classify as REJECT.

**ACCEPT conditions:**
- Metric improved >1% (unless <2% improvement with >20 lines added)
- Metric equal (within 1%) AND lines_delta < 0 (simplification)

**NEAR_MISS conditions:**
- Metric within 1% of best AND lines_delta >= 0 (not a simplification)

**REJECT conditions:**
- Metric worsened >1%
- Tiny improvement with large complexity cost

**On ACCEPT (or SUSPICIOUS_ACCEPT) — before committing, run Step 6b:**

## Step 6b: CORRECTNESS CHECK

- If `$WT/campaigns/<campaign>/checks.sh` exists:
  ```bash
  cd $WT && timeout $CHECKS_TIMEOUT bash campaigns/<campaign>/checks.sh
  ```
- If checks **fail** (non-zero exit) or **timeout**:
  - Downgrade ACCEPT to REJECT. Log description: `"correctness check failed after metric improvement (<improvement_pct>%)"`.
  - Append to musings: `**CORRECTNESS FAILURE**: Metric improved <improvement_pct>% but checks.sh failed. Change breaks correctness.`
  - Rollback: `cd $WT && git checkout -- <changed-files>`
  - Skip to Step 7 (LOG) with REJECT status.
- If checks **pass** (or `checks.sh` does not exist): proceed with ACCEPT.

**On ACCEPT (after passing Step 6b):**
```bash
cd $WT && git add <changed-files> && git commit -m "improve-loop: <description> (<PRIMARY_METRIC_KEY>: <old_metric> -> <new_metric>)"
```
Update `best_metric = new_metric`. Reset `strategy = "normal"`, `consecutive_rejects = 0`. Increment `total_accepts`.
Append to `$WT/campaigns/<campaign>/checkpoints.jsonl`:
```json
{"exp_id": "exp-NNN", "metric": <new_metric>, "commit": "<commit-hash>", "lines_delta_cumulative": <total>, "description": "...", "timestamp": "<ISO-8601>"}
```

**On NEAR_MISS:**
```bash
cd $WT && git stash push -m "near-miss-exp-NNN: <description>"
```

**On REJECT / EARLY_ABORT:**
```bash
cd $WT && git checkout -- <changed-files>
```
