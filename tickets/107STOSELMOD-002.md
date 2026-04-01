# 107STOSELMOD-002: Implement stochastic selection in policy evaluator

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy-eval, possibly policy-runtime and policy-contract
**Deps**: `archive/tickets/107STOSELMOD-001.md`, `specs/107-stochastic-selection-modes.md`

## Problem

After ticket 001 introduces the `AgentSelectionMode` type and compiler validation, the runtime still uses hardcoded argmax selection (`policy-eval.ts:358-377`). This ticket implements the mode-based selection switch, including softmax sampling and weighted sampling with deterministic seed derivation.

## Assumption Reassessment (2026-04-02)

1. `policy-eval.ts:358-377` has the argmax selection logic: `bestScore = max(scores)` → `filter` → tie-breakers → `bestCandidates[0]` — confirmed.
2. The function receives `rng: Rng` parameter (used by tie-breakers) — confirmed at `applyTieBreaker` line 141.
3. `packages/engine/src/kernel/prng.ts` exports `createRng(seed: bigint)` for seed derivation — confirmed.
4. `CompiledAgentProfile` is accessed at `policy-eval.ts:255` via `catalog.profiles[profileId]` — confirmed; `profile.selection.mode` will be available after ticket 001.
5. `completion-guidance-choice.ts:98` has a parallel argmax pattern for inner decisions — confirmed; this stays argmax per spec Non-Goals.

## Architecture Check

1. Selection mode governs only top-level move selection — inner decisions (`completion-guidance-choice.ts`) remain argmax.
2. Seed derivation uses `createRng()` from `prng.ts` with a state-derived seed + salt — never consuming the authoritative RNG stream (Foundation 8).
3. Same state + same seed + same profile = same selection, even for stochastic modes (Foundation 8).
4. No game-specific logic — the selection algorithms are generic (Foundation 1).

## What to Change

### 1. Implement selection mode switch in `policy-eval.ts`

Replace the argmax block (lines 358-377) with a mode-based switch:

```typescript
switch (profile.selection.mode) {
  case 'argmax':
    // Current behavior: best score → tie-breakers → first candidate
    break;

  case 'softmaxSample': {
    const temperature = profile.selection.temperature!;
    // Compute softmax: P(i) = exp(score_i / T) / Σ exp(score_j / T)
    // Derive selection seed: createRng(stateHash ^ SELECTION_SALT)
    // Sample one candidate using derived seed
    break;
  }

  case 'weightedSample': {
    // Shift scores: adjusted_i = score_i - min(scores)
    // If all zero → uniform random via derived seed
    // Otherwise sample proportional to adjusted scores
    break;
  }
}
```

### 2. Implement seed derivation

Create a selection-specific derived RNG using `createRng()` from `prng.ts`:

```typescript
import { createRng } from '../kernel/prng.js';

const SELECTION_SALT = 0x...n; // fixed salt for selection domain
const selectionRng = createRng(BigInt(state.stateHash) ^ SELECTION_SALT);
```

The derived RNG is used only for stochastic selection — it does not modify the game's authoritative RNG state.

### 3. Implement softmax sampling

```typescript
function softmaxSample(
  candidates: readonly CandidateEntry[],
  temperature: number,
  rng: Rng,
): { selected: CandidateEntry; probabilities: readonly number[] }
```

Numerical stability: subtract max score before exponentiating to avoid overflow.

### 4. Implement weighted sampling

```typescript
function weightedSample(
  candidates: readonly CandidateEntry[],
  rng: Rng,
): { selected: CandidateEntry; probabilities: readonly number[] }
```

Shift scores to non-negative, compute cumulative distribution, sample.

### 5. Verify `policy-runtime.ts` and `policy-contract.ts`

Check whether these files need updates:
- `policy-runtime.ts`: Profile is accessed directly in `policy-eval.ts:255` — may not need changes
- `policy-contract.ts`: Check if `AGENT_POLICY_SELECTION_KEYS` constant is needed for consistency

Update if needed, or document that no changes are required.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — selection switch + sampling algorithms)
- `packages/engine/src/kernel/prng.ts` (read — import `createRng`; possibly add `SELECTION_SALT` constant)
- `packages/engine/src/agents/policy-runtime.ts` (verify — may not need changes)
- `packages/engine/src/contracts/policy-contract.ts` (verify — may not need changes)

## Out of Scope

- Trace recording for selection (ticket 003)
- YAML data migration (ticket 003)
- Changing `completion-guidance-choice.ts` — inner decisions stay argmax
- Mixed strategy output formats beyond single-candidate selection

## Acceptance Criteria

### Tests That Must Pass

1. `argmax` mode: identical behavior to pre-spec selection (same candidate selected given same scores)
2. `softmaxSample` mode: with fixed seed, produces deterministic stochastic selection
3. `softmaxSample` mode: different temperatures produce different probability distributions
4. `softmaxSample` mode: temperature → 0 converges to argmax behavior; temperature → ∞ converges to uniform
5. `weightedSample` mode: scores [10, 5, 1] produce proportional sampling frequencies
6. `weightedSample` mode: all-equal scores produce uniform distribution
7. Determinism: same state + same seed + same profile = same selection across 100 runs
8. Seed isolation: stochastic selection does not consume or modify `state.rng`
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Authoritative game RNG stream is never consumed by selection
2. Selection seed is derived deterministically from game state hash + fixed salt
3. `argmax` mode produces byte-identical results to pre-spec behavior
4. All selection algorithms are O(n) over the candidate set (Foundation 10)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — new test suite section for selection modes (argmax equivalence, softmax sampling, weighted sampling, determinism, seed isolation)

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js`
2. `pnpm turbo build && pnpm turbo test`
