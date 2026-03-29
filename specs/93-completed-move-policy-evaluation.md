# Spec 93: Completed-Move Policy Evaluation

**Status**: Draft
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 15 (implemented)
**Estimated effort**: 3-5 days
**Origin**: FITL VC agent evolution campaign — 12 experiments proved that Tier 1 (YAML weight) changes hit a hard ceiling because the policy evaluator scores template moves, not completed moves. Preview returns `unknown` for all non-pass FITL moves.

## Problem Statement

The PolicyAgent's evaluation flow has a fundamental ordering problem: it scores moves **before** completion, then completes moves separately.

Current flow in `PolicyAgent.chooseMove`:

```
1. preparePlayableMoves(classifiedMoves)
   → template completion via evaluatePlayableMoveCandidate
   → produces completedMoves (TrustedExecutableMove[])
2. evaluatePolicyMove(completedMoves.map(m => m.move))
   → canonical candidate ordering
   → pruning, scoring, tie-breaking
   → preview via classifyPlayableMoveCandidate → probeMoveViability
3. Match selected move back to trusted candidate
```

Step 2 re-probes each completed move's viability, but `probeMoveViability` does not recognize pre-resolved inner decisions. For games with nested decision trees (FITL actions with target space selection, piece movement choices, etc.), the probe returns `{viable: true, complete: false, stochastic: false}` — making `classifyPlayableMoveCandidate` classify them as `rejected: notDecisionComplete`. The preview system then returns `{kind: 'unknown', reason: 'unresolved'}` for every non-pass candidate.

**Consequence**: The `projectedSelfMargin` feature (and all other `preview.*` refs) resolve to `unknown` for ALL non-pass moves. The coalesce fallback returns the current margin — a constant for all candidates at a decision point. This means:

- All candidates of the same action type score identically
- The tiebreaker (stableMoveKey) determines target selection arbitrarily
- Weight changes only affect action-type preference, never target quality
- The entire preview surface designed in Spec 15 is inert for complex games

This was proven empirically: 10 weight/parameter experiments on the FITL VC agent all produced identical compositeScore=10.5333 despite weight ranges from 0.5 to 5.0.

## Root Cause Analysis

The root cause is a mismatch between two correct but incompatible subsystems:

1. **Move enumeration** produces template moves — outer action selections with inner decisions unresolved. This is correct: enumeration is the kernel's responsibility and must be bounded.

2. **Preview** requires `playableComplete` moves — all decisions resolved so `applyTrustedMove` can produce a deterministic next state. This is also correct: preview must not resolve fresh decisions.

3. **Move completion** (`preparePlayableMoves`) resolves inner decisions via `evaluatePlayableMoveCandidate`, producing `TrustedExecutableMove`s. These ARE `playableComplete` moves.

4. **The ordering problem**: Completion happens in `PolicyAgent.chooseMove` (step 1), but the completed moves are fed to `evaluatePolicyMove` (step 2) which re-probes them and hits the same `notDecisionComplete` classification.

The completed moves already exist and are already `playableComplete`. The policy evaluator just needs to know this.

## Goals

- Enable the preview surface for games with nested decision trees (FITL, and any future game with multi-step action pipelines)
- Allow the policy evaluator to score completed moves with working preview
- Maintain all Spec 15 contracts: determinism, visibility safety, bounded computation, no search
- Maintain the existing `Agent.chooseMove` contract
- No changes to kernel code (move enumeration, viability probing, or effect execution)

## Non-Goals

- Template move completion inside the policy evaluator (Spec 15 explicitly defers this)
- Multi-ply search or rollouts
- Changes to `probeMoveViability` or `classifyPlayableMoveCandidate` in the kernel
- New YAML authoring surface (this enables the existing surface to work correctly)
- Performance optimization of the completion path

## Proposed Design

### Core Change: Pass Trusted Metadata Through to Policy Evaluation

The `EvaluatePolicyMoveInput` currently accepts `readonly legalMoves: readonly Move[]`. The completed moves from `preparePlayableMoves` are `TrustedExecutableMove[]` — a superset of `Move` that includes `sourceStateHash` and `provenance`.

**Option A — Widen the input type**: Change `legalMoves` to accept `readonly (Move | TrustedExecutableMove)[]` and have the preview system recognize trusted moves as pre-completed.

**Option B — Carry classification alongside moves**: Add an optional `readonly classifications?: ReadonlyMap<string, PlayableCandidateClassification>` to `EvaluatePolicyMoveInput`. When present, the preview system uses these pre-computed classifications instead of re-probing.

**Option C — Change preview to accept TrustedExecutableMove directly**: Modify `PolicyPreviewCandidate` to optionally carry a `TrustedExecutableMove`, and have `getPreviewOutcome` skip the probe when one is present.

**Recommendation: Option C** — it is the most surgical change with the smallest API surface impact. The preview system gains an optional fast-path for pre-completed moves without changing the policy evaluator's external contract.

### Detailed Changes

#### 1. Extend `PolicyPreviewCandidate`

```typescript
export interface PolicyPreviewCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly trustedMove?: TrustedExecutableMove;  // NEW
}
```

When `trustedMove` is present, the preview runtime skips `classifyPlayableMoveCandidate` and directly applies the trusted move via `applyTrustedMove`.

#### 2. Modify `getPreviewOutcome` in `policy-preview.ts`

```typescript
function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
  const cached = cache.get(candidate.stableMoveKey);
  if (cached !== undefined) {
    return cached;
  }

  let outcome: PreviewOutcome;
  if (candidate.trustedMove !== undefined) {
    // Fast path: move is already completed and trusted
    outcome = tryApplyPreview(candidate.trustedMove);
  } else {
    // Original path: probe viability first
    const classification = deps.classifyPlayableMoveCandidate(
      input.def, input.state, candidate.move, input.runtime,
    );
    outcome = classification.kind === 'playableComplete'
      ? tryApplyPreview(classification.move)
      : { kind: 'unknown', reason: 'unresolved' };
  }

  cache.set(candidate.stableMoveKey, outcome);
  return outcome;
}
```

The extracted `tryApplyPreview` handles the common apply-check-rng-observe path.

#### 3. Thread `TrustedExecutableMove` from completion to evaluation

In `PolicyAgent.chooseMove`, the completed moves are already `TrustedExecutableMove[]`. These need to reach the policy evaluator's candidate construction. Two sub-options:

**3a**: Extend `EvaluatePolicyMoveInput` to accept `readonly legalMoves: readonly Move[]` plus a parallel `readonly trustedMoves?: ReadonlyMap<string, TrustedExecutableMove>` keyed by stable move key. The evaluator's `canonicalizeCandidates` attaches the trusted move to each `CandidateEntry`, which flows to `PolicyPreviewCandidate`.

**3b**: Change `legalMoves` type to `readonly (Move & { readonly __trusted?: TrustedExecutableMove })[]`. Less clean, but avoids a second parameter.

**Recommendation: 3a** — explicit is better than smuggling. A `ReadonlyMap` keyed by stable move key is clean, optional, and backward-compatible.

#### 4. No changes to CandidateEntry internal scoring

The evaluator's scoring, pruning, and tie-breaking logic is unchanged. The only difference is that `PolicyPreviewCandidate.trustedMove` is populated, causing the preview system to produce actual values instead of `unknown`.

### Safety Analysis

**Determinism (F5)**: Preserved. The trusted move is the same move that would be completed — same decisions, same RNG consumption. Preview applies it deterministically. The RNG-changed check still rejects non-deterministic outcomes.

**Visibility (Spec 15 §Visibility)**: Preserved. Preview still masks hidden information through `getPolicySurfaceVisibility` and `isSurfaceVisibilityAccessible`. The change only affects whether preview can produce a state to inspect, not what it exposes from that state.

**Bounded computation (F6)**: Preserved. Completion is already bounded by `completionsPerTemplate`. Preview applies each completed move once — `O(completedMoves)` applications, each bounded by the effect tree depth.

**Engine agnosticism (F1)**: Preserved. All changes are in `packages/engine/src/agents/` — the kernel is untouched.

**No search (Spec 15 §V1)**: Preserved. This is still one-ply evaluation of concrete moves. The moves are concrete because they've been completed. No template expansion happens inside the evaluator.

### Performance Impact

**Additional cost**: One `applyTrustedMove` call per completed candidate that survives pruning (preview is lazy, computed only when a `preview.*` ref is evaluated). For FITL with ~120 completed moves per decision point (40 templates × 3 completions), this adds ~120 move applications.

**Mitigation**: Preview is already cached per `stableMoveKey`. Lazy evaluation means only candidates that reach the scoring phase (post-pruning) incur preview cost. The FITL campaign showed that pruning removes ~50% of candidates before scoring.

**Benchmark requirement**: Before merging, run the FITL performance campaign harness to verify no regression beyond 5% in combined_duration_ms.

## Deliverables

### Source changes

| File | Change |
|------|--------|
| `packages/engine/src/agents/policy-preview.ts` | Add `trustedMove` to `PolicyPreviewCandidate`, add fast-path in `getPreviewOutcome`, extract `tryApplyPreview` |
| `packages/engine/src/agents/policy-eval.ts` | Extend `EvaluatePolicyMoveInput` with optional `trustedMoveIndex`, thread trusted moves to `CandidateEntry` and `PolicyPreviewCandidate` |
| `packages/engine/src/agents/policy-agent.ts` | Build `trustedMoveIndex` map from `preparePlayableMoves` output and pass to `evaluatePolicyMove` |
| `packages/engine/src/agents/policy-runtime.ts` | Update `PolicyRuntimeCandidate` to optionally carry `TrustedExecutableMove` |

### Test changes

| Test | Purpose |
|------|---------|
| `test/unit/policy-preview.test.ts` | New: verify that `trustedMove` fast-path produces `ready` outcome for completed FITL moves |
| `test/unit/policy-eval.test.ts` | New: verify that `trustedMoveIndex` causes preview refs to resolve (not `unknown`) |
| `test/unit/policy-production-golden.test.ts` | Update: FITL policy summary golden will change (scores now reflect projected margins) |
| `test/integration/policy-agent-preview.test.ts` | New: end-to-end test — compile FITL spec, enumerate+complete moves, verify PolicyAgent scores differ across candidates of the same action type |

### Golden fixture updates

The FITL policy catalog golden (`fitl-policy-catalog.golden.json`) is unchanged — no compilation changes. The FITL policy summary golden (`fitl-policy-summary.golden.json`) will change because the agent now scores using actual projected margins instead of fallback constants.

## Compatibility

This change is **fully backward-compatible**:

- `trustedMove` on `PolicyPreviewCandidate` is optional — existing callers that don't provide it get the current behavior (probe → classify → potentially `unknown`)
- `trustedMoveIndex` on `EvaluatePolicyMoveInput` is optional — callers that don't provide it get current behavior
- Games where moves are already `playableComplete` (simple action structures) see no behavior change
- Games with nested decisions (FITL) see preview resolve to actual values instead of `unknown`

## Acceptance Criteria

1. For FITL, `PolicyAgent` decision traces show `unknownRefIds: []` (empty) for completed moves that don't involve randomness
2. Different parameterizations of the same FITL action produce different `projectedSelfMargin` values
3. All existing engine tests pass without modification (except golden fixture updates)
4. Performance benchmark: FITL 15-seed tournament completes within 110% of current duration
5. Texas Hold'em policy evaluation is unchanged (Texas moves are already `playableComplete` or legitimately `unknown` due to hidden information)
6. No kernel source files modified
