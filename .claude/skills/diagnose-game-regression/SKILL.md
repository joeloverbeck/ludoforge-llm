---
name: diagnose-game-regression
description: "Diagnose game simulation regressions from a report file. Verifies traceability, runs a diagnostic simulation, identifies root causes, and produces specs (for architectural issues) or tickets (for data fixes). Use after failed evolution campaigns, unexpected simulation results, or post-spec validation failures."
user-invocable: true
arguments:
  - name: report_path
    description: "Path to a regression report file (e.g., reports/fitl-vc-evolution-blockers-2026-04-02.md)"
    required: true
---

# Diagnose Game Regression

Systematically diagnose game simulation regressions. Verify traceability, run a diagnostic simulation, trace root causes through the codebase, and produce the appropriate output: specs for architectural engine issues, tickets for game-spec data fixes, and traceability improvement tickets when diagnosis is blocked by insufficient trace data.

## Invocation

```
/diagnose-game-regression <report-path>
```

**Arguments** (required, positional):
- `<report-path>` — path to a regression report file (e.g., `reports/fitl-vc-evolution-blockers-2026-04-02.md`)

If the argument is missing, ask the user to provide it before proceeding.

## Worktree Awareness

If working inside a worktree (e.g., `.claude/worktrees/<name>/`), **all file paths in this skill** — reads, writes, globs, greps, simulation commands — must be prefixed with the worktree root. The default working directory is the main repo root; paths without an explicit worktree prefix will silently operate on main, not the worktree. This applies to every path reference below.

## Process

Follow these steps in order. Do not skip any step.

### Step 1: Read Report & Identify Game

1. Read the report file completely.
2. Read `docs/FOUNDATIONS.md` — all output must align with these principles.
3. Extract from the report:
   - **Symptoms**: What went wrong (e.g., "0% win rate", "games hit maxTurns", "agent passes instead of acting")
   - **Affected game**: Identify the `data/games/<game>/` directory from file paths in the report. If multiple games are mentioned, ask the user which to diagnose first (single game per invocation).
   - **Proposed root causes**: Any hypotheses already in the report (to validate, not to assume)
   - **File references**: Specific engine files, game-spec files, or test files mentioned
   - **Prior investigation**: What was already tried and what evidence exists

4. Locate the game's entrypoint: `data/games/<game>.game-spec.md` (the file that `loadGameSpecBundleFromEntrypoint` reads). Verify it exists.

### Step 2: Traceability Assessment

Before diagnosing the game regression, verify that the game produces sufficient trace data for diagnosis.

1. **Build the engine**: `pnpm -F @ludoforge/engine build`

2. **Run a single-seed simulation** with detailed tracing. Use the game's existing tournament runner if one exists in `campaigns/`, or compile and run directly:
   ```bash
   # If tournament runner exists:
   node campaigns/<campaign>/run-tournament.mjs --seeds 1 --players <N> --evolved-seat <seat> --max-turns 500 --trace-seed 1000

   # If no runner: write a minimal diagnostic script that:
   # - Compiles the game spec
   # - Runs runGame() for seed 1000 with PolicyAgents at traceLevel: 'detailed'
   # - Dumps trace to a temporary JSON file
   ```

3. **Assess trace quality**. The trace MUST capture (check each):
   - [ ] Per-decision agent traces: which profile, which action selected, final score, candidate count
   - [ ] Per-candidate score breakdown: individual score contributions from each consideration
   - [ ] Preview usage: how many candidates were preview-evaluated, what outcomes (ready/stochastic/hidden/failed)
   - [ ] Pruning steps: which pruning rules fired, how many candidates survived
   - [ ] Tie-break chain: which tie-breakers applied, how many candidates remained after each
   - [ ] Victory margin at game end (or at truncation for maxTurns games)
   - [ ] Stop reason: why the game ended (victory, maxTurns, noLegalMoves, etc.)

4. **If ANY trace quality check fails**:
   - Record the gap (e.g., "no per-candidate score breakdown available")
   - This becomes a **traceability ticket** — the highest-priority output of this skill
   - Traceability tickets unblock diagnosis; produce them BEFORE any fix tickets
   - Continue diagnosis with whatever trace data IS available, but note which findings are uncertain due to trace gaps

5. **If all checks pass**: Record "traceability sufficient" and proceed.

### Step 3: Diagnostic Simulation Analysis

Parse the trace from Step 2 to identify anomalies. For each decision point of the affected agent:

1. **Suboptimal action selection**: Did the agent choose a clearly worse action? (e.g., pass instead of agitate, no-op instead of Rally)
2. **Surface/feature anomalies**: Are any surfaces returning unexpected values?
   - `unknown` or `hidden` for surfaces that should be public
   - Constant values across all candidates (zero differentiation)
   - Missing preview evaluations (preview_eval=0 when considerations reference preview)
3. **Degenerate legal moves**: Are there legal moves that do nothing? (empty targets, 0-parameter actions)
4. **Pruning failures**: Are pass-like actions surviving pruning? Are non-pass actions being incorrectly pruned?
5. **Score distribution**: Do all candidates of the same action type score identically? If so, only tie-breakers differentiate — which is fragile.
6. **Victory reachability**: Is the victory condition being checked? Is the agent's current margin trajectory plausible for reaching the threshold?

Record each anomaly with:
- The decision point (move number, turn, phase)
- The expected behavior vs actual behavior
- The specific trace data showing the anomaly

### Step 4: Root Cause Analysis

For each anomaly from Step 3, trace through the codebase to find the root cause. Use Explore agents for specs with many anomalies (>3).

For each anomaly, determine:

1. **Where in the pipeline does the problem occur?**
   - Legal move enumeration → kernel issue
   - Agent scoring/consideration evaluation → agent layer issue
   - Preview surface resolution → observer/visibility issue
   - Pruning rule evaluation → agent library / game-spec tag issue
   - Tie-break resolution → tie-breaker configuration issue
   - Victory condition evaluation → terminal condition / game-spec issue

2. **What category of fix is needed?**
   - **Engine architectural change** (e.g., `requiresHiddenSampling` is whole-state instead of per-surface) → will produce a **spec**
   - **Game-spec data fix** (e.g., missing `pass` tag on coup-phase action) → will produce a **ticket**
   - **Observability/visibility config** (e.g., `allowWhenHiddenSampling` setting) → will produce a **ticket**
   - **Agent library / profile fix** (e.g., missing consideration, wrong weight) → will produce a **ticket**
   - **Traceability gap** (found during Steps 2-3) → will produce a **ticket**

3. **What files are affected?** Validate all file paths against the codebase.

4. **What are the fix options?** For each root cause, identify at least the simplest viable fix. For architectural issues, identify whether a quick workaround exists alongside the proper fix.

### Step 5: Classify & Present Findings

Present all findings in a structured table:

```
## Diagnosis: <game-name> regression

| # | Finding | Category | Fix Type | Priority | Root Cause |
|---|---------|----------|----------|----------|------------|
| 1 | <title> | Engine   | Spec     | HIGH     | <1-line cause> |
| 2 | <title> | Game-spec| Ticket   | HIGH     | <1-line cause> |
| 3 | <title> | Trace gap| Ticket   | CRITICAL | <1-line cause> |

### Traceability gaps (if any)
1. **#N: <title>** — <what's missing from traces, why it blocks diagnosis>

### Architectural issues (→ specs)
1. **#N: <title>** — <root cause summary, proposed fix approach>

### Data fixes (→ tickets)
1. **#N: <title>** — <what to change and where>

### Recommended fix order
1. Traceability gaps first (unblock diagnosis)
2. Data fixes (quick wins)
3. Architectural issues (require spec → reassess → ticket decomposition)
```

**Wait for user approval.** The user may:
- Override any classification
- Adjust priority ordering
- Request deeper analysis of specific findings
- Decide some findings are not worth fixing

Do not proceed to Step 6 until the user has approved.

### Step 6: Write Specs & Tickets

**For architectural findings** (→ specs):

Determine the next available spec number by scanning `specs/` and `archive/specs/`. Write a spec to `specs/<N>-<slug>.md` following the project's standard spec format (see `specs/105-explicit-preview-contracts.md` or the most recent spec for format conventions):

- Status: Draft
- Metadata: Priority, Complexity, Dependencies, Blocks, Estimated effort
- Sections: Problem Statement, Goals, Non-Goals, FOUNDATIONS.md Alignment, Design, Testing, Migration Checklist

**For data fixes and traceability gaps** (→ tickets):

Ask the user for a ticket namespace (e.g., `DIAGFITL`). Write tickets to `tickets/<NS>-<NNN>.md` following `tickets/_TEMPLATE.md` exactly:

- Status: PENDING
- All required sections: Problem, Assumption Reassessment, Architecture Check, What to Change, Files to Touch, Out of Scope, Acceptance Criteria, Test Plan

**Validate ticket dependencies**: Run `pnpm run check:ticket-deps` to verify all `Deps` paths.

### Step 7: Final Summary

Present:
- Number of findings: traceability gaps, architectural specs, data fix tickets
- List of all output files with paths
- Dependency graph (which outputs block which)
- Recommended implementation order
- Suggested next steps:
  - `/reassess-spec specs/<N>.md` for each architectural spec
  - `/implement-ticket tickets/<NS>-<NNN>.md` for each data fix ticket

Do NOT commit. Leave files for user review.

## Guardrails

- **FOUNDATIONS alignment is mandatory**: Every spec and ticket must respect `docs/FOUNDATIONS.md`. Never propose a fix that violates a Foundation principle.
- **Codebase truth**: All file paths, types, and functions in specs/tickets must be validated against the actual codebase.
- **Traceability first**: If diagnosis is blocked by insufficient trace data, traceability improvement tickets are the FIRST output. Don't guess at root causes when you can't see the evidence.
- **Spec vs ticket boundary**: Engine architectural changes → spec (consumed by `/reassess-spec` → `/spec-to-tickets`). Data fixes (tags, config, observability, agent library) → direct tickets.
- **No implementation**: This skill writes specs and tickets only. It does not fix bugs, modify engine code, or change game specs.
- **Single game focus**: Each invocation diagnoses one game. If the report covers multiple games, ask the user which to diagnose first.
- **Validate proposed fixes from report**: The report may contain proposed fixes. Validate them against the codebase — don't assume the report's proposals are correct. The report is input, not gospel.
- **Worktree discipline**: If working in a worktree, ALL file operations use the worktree root path.
- **Simulation timeout**: If the diagnostic simulation runs longer than 10 minutes for a single seed, kill it and note the timeout as a finding (game may be degenerate or stuck in an infinite loop).
