---
name: bootstrap-baseline
description: "Bootstrap a winning agent baseline for a game. Runs seeds, analyzes traces, autonomously upgrades the agent profile until it wins reliably (3/5 seeds). Use before improve-loop campaigns or when establishing agents for new games."
user-invocable: true
arguments:
  - name: game_folder
    description: "Path to the game data directory (e.g., data/games/fire-in-the-lake)"
    required: true
  - name: profile_id
    description: "Agent profile ID to bootstrap (e.g., vc-evolved)"
    required: true
---

# Bootstrap Baseline

Establish a proven winning agent baseline by autonomously upgrading a PolicyAgent profile until it reliably wins game simulations. This skill runs before improve-loop campaigns to ensure the starting point is functional, not broken.

## Invocation

```
/bootstrap-baseline <game-folder> <profile-id>
```

**Arguments** (both required, positional):
- `<game-folder>` — path to the game data directory (e.g., `data/games/fire-in-the-lake`)
- `<profile-id>` — agent profile ID to bootstrap (e.g., `vc-evolved`)

If either argument is missing, ask the user to provide it before proceeding.

## Process

Follow these steps in order. Do not skip any step.

### Step 1: Read Game Spec & Identify Victory Conditions

1. Read `docs/FOUNDATIONS.md` — all output must align with these principles.
2. Locate the game's entrypoint: `data/games/<game>.game-spec.md` (at repo root level in `data/games/`, not inside the game subdirectory). Verify it exists.
3. Read the entrypoint to identify imported component files.
4. Read the **agents file** (find it from the imports — typically `*-agents.md` or `92-agents.md`). This contains the profile to bootstrap.
5. Read the **terminal conditions file** (typically `*-terminal.md` or `90-terminal.md`). Extract:
   - Victory formula for the target seat (e.g., "Total Opposition + VC Bases > 35")
   - When victory is checked (e.g., during Coup phase)
   - What game state the agent needs to influence to win
6. Read the **observability config** (typically `*-observability.md` or `93-observability.md`). Note which surfaces are available for agent preview and which are blocked.
7. Identify the **player count** and **seat assignments** from the game spec metadata.

### Step 2: Assess Agent Profile

1. Search for the target profile ID in the agents file.

2. **If the target profile exists**:
   - Read it completely: parameters, considerations, pruning rules, tie-breakers, features, preview config
   - Read the **baseline profile** for the same seat (if one exists — typically `<seat>-baseline`)
   - Compare: what considerations does the baseline have that the target is missing? What's different?
   - Catalog the full **library** of available considerations, features, aggregates, pruning rules, tie-breakers

3. **If the target profile does NOT exist**:
   - Find the baseline profile for the same seat
   - Clone it: copy all fields, rename to the target profile ID
   - Update the seat bindings to point to the new profile
   - This creates the initial mutable profile

4. Record the initial state of the profile for the final summary.

### Step 3: Build & Run Initial Seed

1. **Build the engine**: `pnpm -F @ludoforge/engine build`

2. **Write a temporary diagnostic runner script** (e.g., `/tmp/bootstrap-runner-<game>.mjs`) that:
   - Imports `loadGameSpecBundleFromEntrypoint`, `runGame`, `PolicyAgent` from the engine
   - Compiles the game spec from the entrypoint
   - Accepts CLI args: `--seed N`, `--seeds N` (for multi-seed validation), `--max-turns 500`
   - For single-seed mode: runs `runGame()` with PolicyAgents at `traceLevel: 'verbose'`
   - For multi-seed mode: runs N seeds and reports win/loss per seed
   - Outputs JSON to stdout:
     ```json
     {
       "seed": 1000,
       "stopReason": "maxTurns|terminal",
       "win": true|false,
       "margin": -4,
       "totalMoves": 500,
       "turnsCount": 7,
       "evolvedMoves": [{ "move": {...}, "legalMoveCount": N, "agentDecision": {...} }]
     }
     ```
   - For multi-seed: `{ "wins": 3, "total": 5, "seeds": [...per-seed results...] }`

3. **Run seed 1000** in single-seed mode. Parse the output.

4. Record: did the agent win? What was the margin? How many decisions did it make? What was the stop reason?

### Step 4: Analyze Trace for Structural Blockers

Check for issues that **YAML profile changes cannot fix**. For each decision point of the target agent:

1. **Preview blocked**: `previewUsage.evaluatedCandidateCount === 0` when the profile references preview surfaces, OR `unknownRefs` contains entries with `reason: 'hidden'`
2. **Missing action tags**: Pruning rules reference `candidate.tag.<X>` but actions lack the tag — pruning rule has no effect (all candidates survive when they shouldn't)
3. **Degenerate legal moves**: Actions with empty parameters (e.g., `$targetSpaces: []`) that are no-ops but survive pruning
4. **Victory unreachable**: Victory condition is never checked during the simulation (e.g., game never reaches the phase where victory is evaluated)
5. **Trace level insufficient**: Per-candidate `candidates[]` arrays missing (trace level may be defaulting to `'summary'` instead of `'verbose'`)

**If ANY structural blocker is found**:
- STOP the bootstrapping process
- Produce a diagnosis report following the same format as `/diagnose-game-regression` Step 5 output
- File tickets for data fixes and specs for architectural issues (ask user for namespace)
- Present the blocker report to the user and exit

**If no structural blockers**: Record "no structural blockers found" and proceed.

### Step 5: Analyze Trace for Profile Weaknesses

If no structural blockers, analyze the agent's decision quality:

1. **Pass/no-op preference**: Is the agent choosing pass actions or zero-effect moves when better alternatives exist? → Missing considerations or insufficient weights for active actions
2. **Zero differentiation**: Do all candidates of the same action type score identically? → Considerations don't produce different scores across candidates (may need completion-scope or preview-referencing considerations)
3. **Missing action coverage**: Are there action types the agent never selects? → Compare against baseline profile's consideration set — flag any action-preference considerations present in baseline but missing in target
4. **Preview underutilization**: Is `previewUsage.evaluatedCandidateCount === 0` because the profile has no preview-referencing considerations? → The profile could benefit from `projectedSelfMargin` or similar
5. **Victory margin trajectory**: Is the agent's margin improving, flat, or declining over the course of the game? → Strategic weight adjustments needed
6. **Pruning effectiveness**: Are pruning rules actually eliminating candidates? Check `pruningSteps[].remainingCandidateCount` — if pruning never reduces candidates, the rules may be misconfigured

Record each weakness with specific trace evidence.

### Step 6: Upgrade Profile (Autonomous Loop)

Based on Step 5 analysis, modify the target profile in the agents file. Each iteration should make **one focused change** (not a shotgun of changes):

**Change priority order** (address most impactful weakness first):
1. Add missing pruning rules (eliminate clearly bad moves)
2. Add missing action-preference considerations (cover all action types the seat can use)
3. Adjust weights (favor victory-relevant actions)
4. Add preview-referencing considerations (if preview system is available)
5. Add completion-scope considerations (differentiate within action types)
6. Add/adjust tie-breakers

**After each change**:
1. Rebuild engine: `pnpm -F @ludoforge/engine build`
2. Re-run seed 1000 using the diagnostic runner
3. Analyze the result:
   - **Agent won** → proceed to Step 7
   - **Agent lost but improved** (margin closer to threshold, fewer wasted decisions) → continue loop
   - **Agent lost and no improvement** → the change didn't help; try a different approach
   - **Agent got worse** → revert the change, try something else

**Iteration cap**: Maximum **15 iterations** on seed 1000. If the agent cannot win after 15 attempts:
- Present a report of all changes tried and their effects
- Note which weaknesses remain unresolved
- The user decides whether to continue manually or investigate further

### Step 7: Validate with 5 Seeds

Once the agent wins seed 1000:

1. Run seeds 1000-1004 (5 seeds) using the diagnostic runner in multi-seed mode
2. Count wins: need **3 out of 5** to pass validation

**If 3/5+ wins**: Proceed to Step 8.

**If <3/5 wins**:
- Analyze the losing seed traces (same analysis as Step 5)
- The agent may be overfitting to seed 1000 — look for seed-specific weaknesses
- Make targeted adjustments and re-validate
- Maximum **3 validation rounds**. If the agent can't reach 3/5 after 3 rounds, present current state and let the user decide.

### Step 8: Present Results

Present a structured summary:

```
## Bootstrap Results: <game-name> / <profile-id>

### Outcome: SUCCESS | PARTIAL | BLOCKED

### Victory Conditions
- Formula: <what the agent needs to achieve>
- Threshold: <numeric target>

### Profile Changes (N iterations)
| # | Change | Effect | Margin Before → After |
|---|--------|--------|----------------------|
| 1 | Added preferRallyAction | Won seed 1000 | -4 → +2 |
| 2 | Added preferPopulousTargets | Improved target selection | ... |

### Validation (if reached)
- Seeds: 1000 ✓, 1001 ✗, 1002 ✓, 1003 ✓, 1004 ✗
- Win rate: 3/5 (60%)

### DSL Gaps Noted
[If any]
1. <gap description> — <what would be needed to fix it>

### Suggested Next Steps
1. Review the modified agents file
2. Create a campaign folder: `campaigns/<game>-<seat>-evolution/`
3. Run `/improve-loop campaigns/<campaign>` to optimize further
```

**Clean up**: Delete the temporary diagnostic runner script.

Do NOT commit. Leave the modified agents file for user review.

## Guardrails

- **FOUNDATIONS alignment is mandatory**: Every profile change must respect `docs/FOUNDATIONS.md`. Never introduce game-specific logic in engine code.
- **Tier 1 YAML only**: Only modify the target agent profile in the agents file. Do not modify engine code, observability config, action definitions, terminal conditions, or any other game-spec file.
- **Report, don't work around**: Structural blockers (engine bugs, missing tags, hidden preview surfaces) produce tickets/specs — not silent workarounds or observability config changes.
- **No baseline mutation**: Never modify the baseline/immutable profiles. Only the target profile is mutable.
- **Single seat focus**: Each invocation bootstraps one profile for one seat.
- **Iteration caps**: Maximum 15 single-seed iterations, maximum 3 validation rounds. Don't burn context on a hopeless loop.
- **One change at a time**: Each iteration makes one focused change to the profile. Shotgun changes make it impossible to learn what helped.
- **Revert on regression**: If a change makes the agent worse, revert it before trying the next approach.
- **Temporary runner cleanup**: Delete the diagnostic runner script after the skill completes (success or failure).
- **Codebase truth**: All library item references, action tags, surface paths, and type names must be validated against the actual game spec before using them in the profile.
