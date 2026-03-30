# Campaign: fitl-vc-agent-evolution

## Bootstrap (run before starting the improvement loop)

If `92-agents.md` does not already contain a `vc-evolved` profile, create one by
cloning the current `vc-baseline` profile:

1. Copy the `vc-baseline` profile definition verbatim as a new `vc-evolved`
   profile in the `profiles:` section of `92-agents.md`.
2. Update the `bindings:` section: change `vc: vc-baseline` to `vc: vc-evolved`.
3. The `vc-evolved` profile is the mutable target — the improvement loop modifies
   only this profile and its supporting library items.
4. The `vc-baseline` profile and all other faction profiles remain unchanged as
   controls.

## Objective

Maximize the composite score of an evolved VC (Viet Cong) PolicyAgent playing
Fire in the Lake (FITL) 4-player COIN-series games. The evolved agent occupies
the VC seat against 3 baseline faction agents (US, ARVN, NVA).

VC victory formula: `Total Opposition + VC Bases > 35`.
VC margin = `Total Opposition + VC Bases - 35`.

The composite score combines the VC margin (continuous gradient signal) with a
win rate bonus (threshold-crossing reward):

```
compositeScore = avgMargin + 10 * winRate
```

Higher is better. Baseline expectation for an identical-to-baseline policy is
a compositeScore near 0 (margin near threshold distance, ~0% win rate).

## Campaign Completion

When the campaign ends, the evolved profile's strategy should be promoted to
baseline: update the `vc-baseline` profile to use the evolved strategy, then
remove the `vc-evolved` profile. This makes the winning strategy the new
standard for future campaigns and the browser-based game runner.

## Primary Metric

`compositeScore` = `avgMargin + 10 * winRate` — higher is better.

- `avgMargin`: average VC victory margin at game end across all seeds
- `winRate`: fraction of completed games where VC won (crossed threshold at Coup)
- Measurements within 0.05 composite points of each other are considered equal
  (deterministic fixed seeds — minimum detectable improvement is ~0.0667 per seed)

## Secondary Metric

`lines_delta` — net lines-of-code change across mutable files. Negative =
simplification = good.

## Mutable System

### Tier 1: Policy YAML (primary target)

- `data/games/fire-in-the-lake/92-agents.md` — agent library (features, pruning
  rules, score terms, aggregates, profiles, parameters, bindings)
  - Mutable: `vc-evolved` profile and its supporting library items
  - Immutable within this file: `vc-baseline` profile, `us-baseline`,
    `arvn-baseline`, `nva-baseline` profiles, bindings for non-VC seats

### Tier 2: DSL Extension (when YAML expressiveness is the bottleneck)

- All files under `packages/engine/src/agents/` — policy evaluation, expression
  system, runtime surface, preview, diagnostics, IR
- Kernel types for agent policy: `packages/engine/src/kernel/types.ts` (agent
  policy types only — `AgentPolicyExpr`, `AgentPolicyOperator`,
  `CompiledAgentPolicyRef`, `CompiledAgentTieBreaker`, and related interfaces)
- Compiler agent section: `packages/engine/src/cnl/compile-agents.ts`
- Compiler agent validation: `packages/engine/src/cnl/validate-agents.ts`
- Game spec agent types: `packages/engine/src/cnl/game-spec-doc.ts` (agent-related
  interfaces only)
- Schema artifacts: `packages/engine/schemas/` (when type changes require it)

**Split-commit policy for Tier 2**: DSL infrastructure changes MUST be committed
in a separate commit from the policy YAML change that uses them. On REJECT, only
the policy YAML is rolled back; the DSL improvement persists if it:
  - Passes all engine tests
  - Aligns with `docs/FOUNDATIONS.md`
  - Is a genuine improvement (not just scaffolding for a failed experiment)

### Tier 3: Observability (always-commit regardless of experiment result)

- All files under `packages/engine/src/sim/` — simulator, trace, delta
  computation, enrichment
- Agent diagnostic/trace output in `packages/engine/src/agents/`

**Always-commit policy**: Trace and logging improvements are committed as
permanent infrastructure improvements regardless of whether the associated
agent experiment is accepted or rejected. These changes improve the OBSERVE
phase for all future experiments.

### Tier 4: GameSpec (when DSL extension requires new game-level declarations)

- Other `data/games/fire-in-the-lake/*.md` files — ONLY when a DSL extension
  requires new derived metrics, visibility declarations, or agent-surface
  configuration that cannot live in `92-agents.md`

**Expansion policy**: Focus primarily on Tier 1 (policy YAML). Escalate to
Tier 2 only when the DSL cannot express the needed strategy. Tier 3 changes
are always welcome. Tier 4 only when absolutely necessary.

## Immutable System

- `campaigns/fitl-vc-agent-evolution/harness.sh`
- `campaigns/fitl-vc-agent-evolution/run-tournament.mjs`
- All test files under `packages/engine/test/` (except when DSL changes in
  Tier 2 require corresponding test updates)
- Non-agent kernel code: `packages/engine/src/kernel/` EXCEPT agent policy type
  definitions in `types.ts`
- Non-agent compiler code: `packages/engine/src/cnl/` EXCEPT `compile-agents.ts`,
  `validate-agents.ts`, and agent-related interfaces in `game-spec-doc.ts`
- Everything under `packages/runner/`
- All other game data (`data/games/texas-holdem/`)
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and all build config
- `docs/FOUNDATIONS.md` (read for guidance, never modify)

## Constraints

1. All engine tests must pass (full suite gate). The harness enforces this.
2. The `vc-baseline`, `us-baseline`, `arvn-baseline`, and `nva-baseline` profiles
   must remain unchanged — they are controls.
3. No new runtime dependencies.
4. No changes to public kernel API signatures (non-agent APIs).
5. The game spec (all files except `92-agents.md`) must remain unchanged unless
   a DSL extension requires new agent-surface declarations (Tier 4).
6. New library items added for the evolved profile must not break existing profiles.
7. All engine code changes must align with `docs/FOUNDATIONS.md` — engine
   agnosticism, determinism, bounded computation, immutability.
8. DSL extensions must be game-agnostic (no VC-specific logic in engine code),
   deterministic, bounded, and immutable. The game-specific usage lives in the
   YAML, not the engine code.

## Accept/Reject Logic

```
IF harness fails (crash, build failure, test failure, runner failure):
    REJECT (allow up to 3 trivial-fix retries per experiment)

IF compositeScore improved by > 0.05 (noise tolerance):
    IF improvement > 50% relative AND lines_delta > +50:
        FLAG as suspicious — verify game traces show realistic play
        IF traces look realistic: ACCEPT with note
        ELSE: REJECT
    ELSE:
        ACCEPT

IF compositeScore within 0.05 of best (equal):
    IF lines_delta < 0 (fewer lines = simplification):
        ACCEPT
    ELSE:
        REJECT (near-miss → stash)

IF compositeScore worsened by > 0.05:
    REJECT
```

## Root Causes to Seed

Starting hypotheses for the first experiments:

1. **All VC actions weighted equally**: Rally, March, Attack, Terror, Tax,
   Subvert all get weight 1. VC's economic engine (Tax → resources → Rally →
   guerrillas → bases) should dominate. Experiment: increase Tax and Rally
   weights, decrease combat action weights.

2. **No resource awareness**: `resourceWeight=0.03` means resources barely
   factor in. VC should Tax when resources are low to fund future operations.
   Experiment: add conditional scoring — prefer Tax when selfResources < N.

3. **No victory formula decomposition**: The agent sees overall margin but
   can't distinguish "low because no bases" from "low because no opposition."
   Different remedies needed for each. May require DSL extension for
   zone-level aggregates.

4. **No conditional scoring**: Agent can't say "prefer Rally when few
   guerrillas" or "prefer Tax when poor." The `when` clause on scoreTerms
   enables this. Experiment: add conditional scoreTerms.

5. **Opponent-agnostic actions**: VC should prioritize Subvert (anti-ARVN)
   differently from Attack (anti-military). Experiment: differentiate action
   weights based on game context.

6. **Event cards treated equally**: All events get weight 1.5. Some events
   are much more valuable for VC. Experiment: tune eventWeight or add
   event-discriminating features.

7. **No spatial awareness in scoring**: Agent can't prefer actions in zones
   where opposition is already high (amplification) or where VC bases exist
   (protection). May require DSL extension.

8. **Pass is only pruned action**: Many more bad actions could be pruned
   (e.g., actions that decrease opposition or remove VC bases). Experiment:
   add pruning rules for counterproductive actions.

9. **Trace gaps unknown**: First experiment should run a game, read the
   trace, and identify what information is missing for strategic analysis.
   Experiment: review `last-trace.json` and improve observability.

10. **Parameter tuning unexplored**: Even without new features, adjusting
    `projectedMarginWeight`, `eventWeight`, `resourceWeight` could improve
    performance. Experiment: systematic parameter sweep.

## Experiment Categories

- `action-priority`: Tuning weights for VC-specific actions (Rally, March,
  Attack, Terror, Tax, Subvert). Adjusting which actions are preferred and
  by how much.

- `resource-management`: Features for resource-aware decisions. Tax when
  poor, conserve when rich, budget for multi-turn plans.

- `victory-pursuit`: Features targeting VC's specific victory formula
  (Total Opposition + VC Bases > 35). Actions that directly increase
  opposition markers or place VC bases on the map.

- `pruning`: Rules to eliminate bad plays. Prune actions that decrease
  opposition, remove VC bases, or waste resources on low-value targets.

- `event-evaluation`: Better event card selection. Event-type discrimination,
  conditional event preference based on game state.

- `conditional-strategy`: Adding `when` clauses to scoreTerms for
  game-state-dependent priorities. Tax when poor, Rally when few guerrillas,
  March to expand territory.

- `dsl-extension`: New operators, features, intrinsics, or reference surfaces
  in the engine agent code. Required when YAML DSL cannot express needed
  strategy. MUST be paired with policy YAML change.

- `traceability`: Trace/logging improvements for OBSERVE phase analysis.
  Fill gaps in simulation traces. Always-commit regardless of experiment
  outcome.

- `combined`: Multi-category changes pairing features with pruning,
  conditional logic, or parameter tuning.

### Special Rules for Categories

- **dsl-extension** experiments use split-commit: infrastructure committed
  separately from policy. DSL improvements persist even if policy change is
  REJECTED (provided they pass tests and align with FOUNDATIONS.md).
- **traceability** experiments are always committed regardless of metric
  impact. Infrastructure-only traceability changes (no policy change) are
  acceptable and should be committed as separate improvements.
- All engine code changes must pass the full existing test suite (after any
  necessary test updates for API changes).
- During OBSERVE, read `last-trace.json` (saved by the harness at seed 1000)
  to understand game flow and inform hypothesis generation.

## Thresholds

```
NOISE_TOLERANCE = 0.05          # 0.05 composite points (deterministic fixed seeds — no stochastic noise)
PLATEAU_THRESHOLD = 5           # consecutive rejects before strategy shift
MAX_IMPROVEMENT_PCT = 50        # flag relative gains > 50% as suspicious
REGRESSION_CHECK_INTERVAL = 5   # re-verify baseline every 5 accepts
PIVOT_CHECK_INTERVAL = 10       # PROCEED/REFINE/PIVOT every 10 experiments
```

## Configuration

```
HARNESS_RUNS = 1                # single run per experiment (15 seeds average variance)
HARNESS_SEEDS = 1               # seeds handled internally by run-tournament.mjs (15 seeds)
meta_improvement = false        # meta-loop disabled for this campaign
METRIC_DIRECTION = higher-is-better  # maximize compositeScore
MAX_ITERATIONS = unlimited      # run until externally interrupted
CHECKS_TIMEOUT = 120            # 2 minutes for correctness checks
```

## OBSERVE Phase Protocol (Trace-Driven)

During OBSERVE, the agent MUST:

1. Read `last-trace.json` to review VC's move-by-move decisions
2. Identify moves where VC's choice was clearly suboptimal:
   - Passed when could have Taxed (resources low)
   - Attacked when should have Rallied (few guerrillas)
   - Chose a low-impact action over a high-impact one
3. Check whether the needed strategy can be expressed in current YAML DSL
4. If not, plan a compound experiment: DSL extension (Tier 2) + policy change
5. Review `results.tsv` and `lessons.jsonl` for patterns in what works

The agent SHOULD also:
- Check near-miss stashes (`git stash list`) for combinable ideas
- Read current VC margin breakdown to understand where VC is falling short
- Consider whether the bottleneck is offensive (not enough opposition/bases)
  or defensive (opponents removing VC progress)

## Autonomy Directive

Once the loop begins, run indefinitely. Do NOT ask for permission to continue.
Do NOT stop when easy ideas run out — re-read files, combine near-misses, try
radical alternatives, consult lessons. Read `last-trace.json` during OBSERVE
for game-flow insights. The loop runs until externally interrupted.
