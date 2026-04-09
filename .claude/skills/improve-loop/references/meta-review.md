# Meta-Review (Self-Improving program.md)

**Only if `meta_improvement: true` in program.md.**

Every `META_REVIEW_INTERVAL` experiments:

1. **SNAPSHOT**: Copy program.md to program.md.backup.
2. **ANALYZE**: Read experiment log + musings. Compute:
   - Accept rate over last `META_REVIEW_INTERVAL` experiments
   - Category success rates and UCB1 scores
   - Average improvement per accept
   - Plateau frequency (how often strategy shifted)
   - Near-miss to combine conversion rate
3. **HYPOTHESIZE META-CHANGE**: Propose ONE specific change to program.md. Allowed changes:
   - Threshold values: `ABORT_THRESHOLD`, `PLATEAU_THRESHOLD`, `NOISE_TOLERANCE`, `UCB_EXPLORATION_C`
   - Category weights/priorities and "root causes to seed" list
   - Strategy progression timing
   - Accept/reject thresholds (the complexity vs. improvement boundary)
   - `HARNESS_RUNS`
4. **FORBIDDEN meta-changes** (hard-wired safety rails):
   - The evaluation harness (`harness.sh`)
   - The objective direction (lower-is-better vs higher-is-better)
   - The mutable file list
   - `META_REVIEW_INTERVAL` itself (prevents runaway self-modification)
   - Safety-critical config: `MAX_FIX_ATTEMPTS`, `HARD_TIMEOUT`, `MAX_IMPROVEMENT_PCT`
   - Lesson store and logging format
5. **APPLY**: Edit program.md with the proposed change.
6. **TRIAL**: Run the next `META_TRIAL_WINDOW` experiments under the new program.md.
7. **EVALUATE**: Compare accept rate in trial window vs. the preceding window of the same size.
   - Better or equal → KEEP the program.md change
   - Worse → REVERT to program.md.backup
8. **LOG** in musings.md:
   ```markdown
   ## meta-review-NNN
   **Changed**: <what was changed and from what to what>
   **Trial accept rate**: X/Y (was A/B)
   **Decision**: KEEP | REVERT
   **Learning**: <what was learned about the campaign's dynamics>
   ```
