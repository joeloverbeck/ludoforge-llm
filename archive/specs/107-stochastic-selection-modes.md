# Spec 107: Stochastic Selection Modes

**Status**: COMPLETED
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 104 (unified considerations — selection operates on scored candidates from the consideration pipeline)
**Blocks**: None
**Estimated effort**: 3-5 days

## Problem Statement

The agent policy evaluation pipeline always selects the highest-scoring candidate via deterministic argmax (`policy-eval.ts:358-377`). After scoring all candidates and applying tie-breakers, the single best candidate is chosen.

This is fundamentally incompatible with imperfect-information games. In Texas Hold'em, a deterministic agent that always raises with strong hands and folds with weak ones is trivially exploitable — game theory requires mixed (probabilistic) strategies to be unexploitable. The current architecture cannot express "raise 60% of the time, call 30%, fold 10%" based on hand strength.

For MAP-Elites quality-diversity optimization, deterministic argmax also limits behavioral diversity: all evolved agents converge toward similar strategies differing only in weight ratios. Stochastic selection (e.g., score-proportional sampling) would let evolution explore diverse behavioral phenotypes across the MAP-Elites archive.

This finding was identified by an external architecture review (`brainstorming/agent-dsl-improvements.md`, finding #5). The review proposed transforms, tiers, veto/gate semantics, and stochastic selection. This spec addresses only stochastic selection modes — the part that represents a real architectural ceiling. Transforms, tiers, and veto/gate remain deferred as enhancements.

## Goals

- Add a declarative `selectionMode` to agent profiles controlling how the final move is selected from scored candidates
- Support at minimum: `argmax` (current behavior, default), `softmaxSample` (temperature-based), `weightedSample` (score-proportional)
- Maintain determinism: selection uses a derived seed from the authoritative RNG, never consuming the game's RNG stream
- Record the selection mode and sampling details in traces for auditability
- Reserve future modes that fail at compile time until implemented

## Non-Goals

- Adding transforms (normalize, rank, logistic) to the scoring pipeline — deferred
- Adding lexicographic tier evaluation — deferred
- Adding veto/gate semantics — deferred
- Changing how candidates are scored — only how the final selection is made from scores
- Changing completion guidance selection in `completion-guidance-choice.ts` — inner decisions remain argmax
- Adding opponent modeling or information-set reasoning

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Selection modes are generic — any game can use any mode. Enables imperfect-information games that require mixed strategies. |
| **2. Evolution-First** | Selection mode lives in GameSpecDoc YAML. Evolution can mutate mode and temperature parameters. |
| **7. Specs Are Data** | Selection mode is a declarative enum with numeric parameters, no code. |
| **8. Determinism** | Same profile + same state + same seed = same selection. Stochastic selection uses a derived seed, never the authoritative RNG. Seeded PRNG ensures replay determinism. |
| **9. Replay and Auditability** | Traces record selection mode, sampling probabilities, and which candidate was selected. |
| **10. Bounded Computation** | Selection operates over the finite scored candidate set. Softmax/sampling is O(n) over candidates. |
| **12. Compiler-Kernel Boundary** | Mode validation at compile time. Runtime executes the selection. |
| **14. No Backwards Compatibility** | `argmax` is the default when `selectionMode` is omitted — no behavioral change for existing profiles. No compatibility shim needed. |

## Design

### Part A: Selection Mode Type

```typescript
type AgentSelectionMode =
  | 'argmax'            // Deterministic best-score selection (current behavior, default)
  | 'softmaxSample'    // Temperature-based probability: P(i) ∝ exp(score_i / temperature)
  | 'weightedSample';  // Score-proportional probability: P(i) ∝ max(0, score_i - minScore)

// Reserved for future implementation:
// | 'topKSample'       // Uniform random among top K candidates
// | 'epsilonGreedy'    // argmax with probability (1-ε), uniform random with probability ε
```

Mode semantics:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `argmax` | Select highest-scoring candidate. Ties broken by tie-breaker chain. | Default. Deterministic games, FITL. |
| `softmaxSample` | Compute softmax probabilities from scores using temperature parameter. Sample one candidate using derived seed. | Imperfect-info games (poker). Temperature controls exploration vs. exploitation. |
| `weightedSample` | Shift scores to non-negative, sample proportional to shifted scores. | Evolution diversity. Simpler than softmax, less control. |

### Part B: GameSpecDoc Schema

```yaml
agents:
  profiles:
    holdem-baseline:
      observer: public
      preview:
        mode: disabled
      selection:
        mode: softmaxSample
        temperature: 0.5        # required for softmaxSample
      params: { ... }
      use: { ... }

    us-baseline:
      # selection omitted → defaults to { mode: 'argmax' }
      observer: currentPlayer
      params: { ... }
      use: { ... }
```

- `selection` is an optional object on the profile (defaults to `{ mode: 'argmax' }`)
- `selection.mode` is required if `selection` is present
- `selection.temperature` is required for `softmaxSample`, must be > 0
- Reserved modes produce a compile error with descriptive message

### Part C: Compiled IR

```typescript
interface CompiledAgentSelectionConfig {
  readonly mode: AgentSelectionMode;
  readonly temperature?: number;  // required when mode is 'softmaxSample'
}

// Added to CompiledAgentProfile:
interface CompiledAgentProfile {
  // ... existing fields ...
  readonly selection: CompiledAgentSelectionConfig;  // NEW — defaults to { mode: 'argmax' }
}
```

### Part D: Runtime Changes

`policy-eval.ts` — move selection logic (currently lines 358-377):

Current logic:
```
bestScore = max(scores)
bestCandidates = filter(score === bestScore)
apply tie-breakers until 1 candidate
selected = bestCandidates[0]
```

New logic:
```
switch (profile.selection.mode) {
  case 'argmax':
    → current behavior (unchanged)

  case 'softmaxSample':
    → compute softmax probabilities: P(i) = exp(score_i / T) / Σ exp(score_j / T)
    → derive a selection seed via `createRng()` from `packages/engine/src/kernel/prng.ts`
      using a hash of the game state + a "selection" salt (never consuming the authoritative RNG)
    → sample one candidate using the derived seed
    → selected = sampled candidate

  case 'weightedSample':
    → shift scores: adjusted_i = score_i - min(scores)
    → if all adjusted are 0 → fall back to uniform random (derived seed via `createRng()`)
    → sample proportional to adjusted scores using derived seed
    → selected = sampled candidate
}
```

**Seed derivation**: The selection RNG must be derived using `createRng()` from `packages/engine/src/kernel/prng.ts`, seeded with a hash of the game state combined with a "selection" domain salt (e.g., `createRng(stateHash ^ SELECTION_SALT)`). This never consumes the authoritative RNG stream. This ensures:
- Same state + same profile = same selection (Foundation 8)
- Preview and selection don't interfere with each other's RNG
- Replays are deterministic

### Part E: Trace Recording

```typescript
interface PolicySelectionTrace {
  readonly mode: AgentSelectionMode;
  readonly temperature?: number;              // for softmaxSample
  readonly candidateCount: number;            // total scored candidates
  readonly samplingProbabilities?: readonly number[];  // for stochastic modes
  readonly selectedIndex: number;             // which candidate was picked
}
```

Add to the existing per-decision trace output. For `argmax`, `samplingProbabilities` is omitted. For stochastic modes, it records the probability assigned to each candidate.

### Part F: Default Mode

If `selection` is omitted from a profile, the default is `{ mode: 'argmax' }`. This preserves current behavior for all existing profiles — no behavioral change, no migration required for profiles that don't opt in.

## Testing

1. **argmax mode test**: omitted `selection` → current argmax behavior, identical to pre-spec behavior
2. **softmaxSample mode test**: with fixed seed, produces deterministic stochastic selection; different temperatures produce different probability distributions
3. **weightedSample mode test**: scores [10, 5, 1] produce proportional sampling; all-equal scores produce uniform sampling
4. **Determinism test**: same state + same seed + same profile = same selection across runs (Foundation 8)
5. **Seed isolation test**: stochastic selection does not consume or modify the authoritative game RNG
6. **Trace recording test**: trace includes mode, temperature (if applicable), probabilities, and selected index
7. **Compiler validation tests**: reserved modes rejected; `softmaxSample` without temperature rejected; invalid temperature (≤ 0) rejected
8. **Default mode test**: omitted `selection` → argmax behavior
9. **Behavioral test**: Texas Hold'em with `softmaxSample` produces non-trivial action distributions across repeated games with different seeds

## Migration

### Texas Hold'em

Current: no selection config (implicit argmax).

After:
```yaml
profiles:
  baseline:
    observer: public
    preview:
      mode: disabled
    selection:
      mode: softmaxSample
      temperature: 0.5
```

### FITL

No migration needed. FITL profiles use `argmax` (the default when `selection` is omitted). Profiles that want evolution diversity can opt into stochastic modes later.

## Migration Checklist

- [ ] Add `AgentSelectionMode` type to `types-core.ts`
- [ ] Add `CompiledAgentSelectionConfig` interface to `types-core.ts`
- [ ] Add `selection` field to `CompiledAgentProfile`
- [ ] Add `selection.mode` to profile schema in `game-spec-doc.ts`
- [ ] Add `PolicySelectionTrace` type to `types-core.ts`
- [ ] Add diagnostic codes to `compiler-diagnostic-codes.ts`: invalid mode, reserved mode, missing temperature
- [ ] Update `compile-agents.ts`: validate selection config, default to argmax
- [ ] Update `schemas-core.ts`: add Zod schema for selection config (mode enum + temperature)
- [ ] Update `policy-eval.ts`: mode-based selection logic with seed derivation via `prng.ts:createRng()`
- [ ] Verify whether `policy-runtime.ts` needs changes to pass selection config (profile is accessed directly in `policy-eval.ts:255`; runtime may not need updating)
- [ ] Check whether `policy-contract.ts` needs an `AGENT_POLICY_SELECTION_KEYS` constant (for consistency with `AGENT_POLICY_PREVIEW_KEYS`)
- [ ] Add trace recording for selection mode
- [ ] Migrate Texas Hold'em `92-agents.md` (add `selection: { mode: softmaxSample, temperature: 0.5 }`)
- [ ] Update `GameDef.schema.json`
- [ ] Update all affected tests and fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-04-02

- Implemented the full 107 series across archived tickets `107STOSELMOD-001.md`, `107STOSELMOD-002.md`, and `107STOSELMOD-003.md`.
- Added authored and compiled selection configuration, compiler validation and diagnostics, runtime stochastic selection, trace recording, Texas Hold'em migration to `softmaxSample`, and the required schema/fixture/test updates.
- Deviation from the spec’s original runtime example: the final seed derivation was refined during implementation so stochastic selection is derived from observer-visible policy inputs rather than full authoritative hidden state, preserving Foundation 4 while remaining deterministic and non-consuming.
- Verification passed through the final repo-wide gates:
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
