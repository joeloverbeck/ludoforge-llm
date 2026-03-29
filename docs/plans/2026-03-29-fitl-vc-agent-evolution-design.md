# FITL VC Agent Evolution Campaign — Design

## Context

The VC (Viet Cong) agent in Fire in the Lake uses a baseline policy: all actions
weighted equally, no conditional logic, no resource management, no victory-specific
strategy. This campaign evolves the VC agent using the improve-loop framework,
the same approach that achieved 100% win rate for the Texas Hold'em agent.

FITL is significantly more complex than Texas Hold'em: asymmetric factions,
chooseOne/chooseN actions, spatial operations, and Coup phase victory checks.
VC victory formula: `Total Opposition + VC Bases > 35`.

## Design Decisions

- **Primary metric:** `compositeScore = avgMargin + 10 * winRate` (higher is better)
- **Simulation:** 3 seeds (1000-1002), 500 max turns, 4 players
- **Test gate:** Engine tests only (`pnpm -F @ludoforge/engine test`)
- **Mutable scope:** 4 tiers (YAML policy -> DSL extension -> observability -> GameSpec)
- **Split commits:** DSL/trace infrastructure committed separately; survives REJECT
- **Experiment categories:** 9 UCB1-tracked categories

## Baseline Results

```
compositeScore = 4.6667
avgMargin = -2
winRate = 0.6667 (2/3 seeds)
```

Games end naturally in 20-31 moves (not truncated). VC wins 2/3 baseline games.

## Campaign Structure

```
campaigns/fitl-vc-agent-evolution/
  program.md          # Instruction spec (objectives, scope, categories)
  harness.sh          # Immutable evaluation harness
  run-tournament.mjs  # Immutable tournament runner
  results.tsv         # Experiment log
  musings.md          # Hypothesis/learning journal
```

## Key Design Choices

### Composite Metric Formula

`compositeScore = avgMargin + 10 * winRate`

- Margin provides continuous gradient signal (even when far from winning)
- Win rate bonus rewards crossing the 35 threshold (each win adds ~3.33 points)
- With 3 seeds, win rate jumps in 33% increments — margin dominates as gradient

### Mutable System Tiers

1. **YAML policy** — vc-evolved profile, shared library items
2. **DSL extension** — agent engine code, compiler, types (split-commit)
3. **Observability** — trace/logging improvements (always-commit)
4. **GameSpec** — game-level declarations (last resort)

### Experiment Categories

action-priority, resource-management, victory-pursuit, pruning,
event-evaluation, conditional-strategy, dsl-extension, traceability, combined

## File Changes

- `campaigns/fitl-vc-agent-evolution/*` — new campaign files
- `data/games/fire-in-the-lake/92-agents.md` — added vc-evolved profile, updated binding
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` — regenerated

## Verification

1. `bash campaigns/fitl-vc-agent-evolution/harness.sh` exits 0 with valid compositeScore
2. Trace file `last-trace.json` produced with VC decision data
3. All 4986 engine tests pass
4. vc-evolved profile identical to vc-baseline at start (baseline check confirmed)
