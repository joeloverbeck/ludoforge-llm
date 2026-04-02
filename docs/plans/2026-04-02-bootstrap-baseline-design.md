# Design: bootstrap-baseline skill

**Date**: 2026-04-02
**Status**: Approved

## Problem

The improve-loop skill assumes a functional baseline agent that can at least win sometimes. When recent engine/DSL spec changes break an agent's ability to win (e.g., FITL VC going from 14/15 wins to 0/15), the improve-loop wastes iterations discovering what a quick single-seed diagnostic would reveal. Additionally, new games won't have campaign infrastructure — they need a way to bootstrap a competent agent profile before any optimization campaign starts.

## Trigger

Invoked before any improve-loop campaign, or when establishing an agent profile for a new game. Takes a game data folder and a target profile ID.

## Approach

Single skill (`/bootstrap-baseline <game-folder> <profile-id>`) with 8 steps:

1. Read game spec, identify victory conditions for the target seat
2. Assess agent profile (read or clone from baseline)
3. Build engine, write temporary runner, run initial seed with verbose trace
4. Analyze trace for structural blockers (preview hidden, missing tags, etc.) — STOP if found, produce tickets/specs
5. Analyze trace for profile weaknesses (missing considerations, zero differentiation, suboptimal actions)
6. Upgrade profile autonomously (modify YAML, rebuild, re-run) — max 15 iterations until 1 seed won
7. Validate with 5 seeds (need 3/5 wins) — max 3 validation rounds
8. Present results — final profile, changes made, DSL gaps noted

## Key Design Decisions

- **Self-contained runner**: The skill writes a temporary diagnostic script that compiles and runs the game directly — no campaign folder or `run-tournament.mjs` required. This works for new games without campaign infrastructure.
- **Two-phase victory**: First prove the agent can win 1 seed (fast iteration), then validate reliability at 3/5 seeds.
- **Tier 1 YAML only**: The skill only modifies the target agent profile in the agents file. Structural blockers (engine bugs, missing tags, observability config) produce tickets/specs instead of workarounds.
- **Stop on structural blockers**: If the agent can't win due to issues YAML changes can't fix, the skill stops immediately and produces diagnosis output compatible with `/diagnose-game-regression`.
- **Fully autonomous**: The optimization loop runs without pausing for human input. The user reviews the final result.

## Downstream Workflow

```
New game or broken baseline
  → /bootstrap-baseline data/games/<game> <profile-id>
    → produces working agent profile in agents file
    → (or) produces tickets/specs if structural blockers found
  → Create campaign folder with program.md + harness.sh
  → /improve-loop campaigns/<campaign>
    → iterates from the proven baseline
```

## Scope Boundaries

- Does NOT modify engine code, observability config, or action definitions
- Does NOT create campaign infrastructure (that's manual setup before improve-loop)
- Does NOT commit changes — leaves files for user review
- Does NOT run in a worktree — operates on main working tree (the profile change IS the deliverable)
