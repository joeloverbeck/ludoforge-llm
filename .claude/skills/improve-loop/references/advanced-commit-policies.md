# Advanced Commit Policies

## Dependent Fixture Updates

Some campaigns mutate files (e.g., YAML configuration) whose compiled output is captured in snapshot/golden test fixtures. When the harness runs tests, these fixtures fail — not because the code is broken, but because the fixtures are stale.

**Detection**: If the harness CRASH error mentions "golden", "snapshot", "fixture", or "expected vs actual" comparison failures, and the failure appeared immediately after a mutable file change, this is a **fixture sync issue**, not a code bug.

**Resolution protocol**:

1. If `$WT/campaigns/<campaign>/sync-fixtures.sh` exists:
   ```bash
   cd $WT && bash campaigns/<campaign>/sync-fixtures.sh
   ```
   This script should regenerate all dependent fixtures from the current compiled state. It runs AFTER build but BEFORE the harness test gate.

2. If no `sync-fixtures.sh` exists, the agent must identify and regenerate stale fixtures manually:
   - Build the project to produce fresh compiled output
   - Identify which fixture files compare against compiled output (search for "golden", "snapshot", or assertion patterns)
   - Regenerate those fixtures from the current compiled state
   - Retry the harness

3. Fixture regeneration counts as part of the IMPLEMENT step, not as a CRASH retry. The 3-retry limit for CRASH applies to actual code bugs, not fixture sync.

4. Regenerated fixture files are committed alongside the mutable file changes (same commit for ACCEPT, same rollback for REJECT).

5. **Auto-generate sync-fixtures.sh**: After the first successful manual fixture regeneration, write the working regeneration steps as `$WT/campaigns/<campaign>/sync-fixtures.sh`. This eliminates manual regeneration overhead for all subsequent experiments.

**Campaign authors**: If your mutable files feed into compiled output that has golden/snapshot tests, create `sync-fixtures.sh` to automate regeneration. This prevents the agent from spending experiment iterations on fixture discovery.

## Tiered Mutability with Split Commits

Some campaigns define multiple mutability tiers with different commit policies. For example:

- **Tier 1** (primary target): YAML policy changes — committed on ACCEPT, rolled back on REJECT
- **Tier 2** (infrastructure): DSL extensions that enable Tier 1 — committed separately, may persist even if Tier 1 REJECT
- **Tier 3** (observability): Trace/logging improvements — always committed regardless of experiment outcome

**Detection**: If `program.md` defines tiers, levels, or layers in its "Mutable System" section with different commit/rollback policies, use the tiered protocol below.

**Tiered commit protocol**:

1. **During IMPLEMENT**: Tag each changed file with its tier.

2. **On ACCEPT**: Commit all tiers together (or in tier order if program.md requires split commits).

3. **On REJECT with split-commit policy**:
   - Rollback Tier 1 (primary target) changes: `git checkout -- <tier-1-files>`
   - Evaluate Tier 2 (infrastructure) changes independently:
     - Do they pass all tests on their own (without the rejected Tier 1 change)?
     - Do they align with project architectural principles?
     - Are they a genuine improvement, not just scaffolding for a failed experiment?
     - If YES to all: commit Tier 2 separately with description `"infra: <description> (independent of rejected exp-NNN)"`
     - If NO: rollback Tier 2 as well
   - Tier 3 (observability): Always commit if tests pass, regardless of Tier 1/2 outcome

4. **Scope check adjustment**: When tiers have different rollback policies, the scope check in Step 3 must validate against the UNION of all tier file lists, not just Tier 1.

5. **Lines delta accounting**: Count only Tier 1 lines delta for the accept/reject decision. Tier 2 and Tier 3 lines are infrastructure overhead, not experiment complexity.

6. **Fixture re-regeneration after Tier 1 rollback**: If golden/snapshot fixtures were regenerated during the experiment (because Tier 1 changes altered compiled output), re-run fixture regeneration (or `sync-fixtures.sh`) AFTER Tier 1 rollback to restore fixtures to the post-Tier-2-only state. Verify with a build+test cycle before committing Tier 2.

**Campaign authors**: Define tiers explicitly in `program.md` with file lists and commit policies. If no tiers are defined, all mutable files follow the default single-tier protocol.
