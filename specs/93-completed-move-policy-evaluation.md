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

### Core Change: Index-Injection of Trusted Moves into Preview Runtime

The preview system currently re-probes every candidate via `classifyPlayableMoveCandidate` → `probeMoveViability`. Completed moves from `preparePlayableMoves` are `TrustedExecutableMove[]` — already verified as `playableComplete` — but this information is lost when `PolicyAgent.chooseMove` strips the wrappers via `.map(m => m.move)`.

**Design**: Inject a `ReadonlyMap<string, TrustedExecutableMove>` (keyed by `stableMoveKey`) into the preview runtime at construction time. When resolving a candidate's preview, the runtime first checks this index. If a trusted move is found, it bypasses `classifyPlayableMoveCandidate` entirely and applies the trusted move directly.

**Why index-injection over candidate-threading**: The alternative (adding `trustedMove?` to `PolicyPreviewCandidate` and `PolicyRuntimeCandidate`) requires type changes across the candidate pipeline. Index-injection adds the map once at construction — `PolicyPreviewCandidate`, `PolicyRuntimeCandidate`, and `CandidateEntry` types are unchanged. The lookup is by `stableMoveKey`, which is already the caching key.

### Detailed Changes

#### 1. Add `trustedMoveIndex` to `CreatePolicyPreviewRuntimeInput`

```typescript
export interface CreatePolicyPreviewRuntimeInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly runtime?: GameDefRuntime;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;  // NEW — required
}
```

The index is keyed by `stableMoveKey` (computed via `toMoveIdentityKey(def, move.move)`). When present, the preview runtime uses the trusted move directly instead of re-probing.

#### 2. Extract `tryApplyPreview` from `classifyPreviewOutcome` in `policy-preview.ts`

The existing `classifyPreviewOutcome` function does: classify → apply → RNG-check → observation. Extract the apply → RNG-check → observation logic into `tryApplyPreview`:

```typescript
function tryApplyPreview(trustedMove: TrustedExecutableMove): PreviewOutcome {
  // F5 safety: verify the trusted move was completed against the current state
  if (trustedMove.sourceStateHash !== input.state.stateHash) {
    return { kind: 'unknown', reason: 'failed' };
  }
  try {
    const previewState = deps.applyMove(
      input.def, input.state, trustedMove, undefined, input.runtime,
    ).state;
    if (!rngStatesEqual(previewState.rng, input.state.rng)) {
      return { kind: 'unknown', reason: 'random' };
    }
    const observation = deps.derivePlayerObservation(input.def, previewState, input.playerId);
    return {
      kind: 'ready',
      state: previewState,
      requiresHiddenSampling: observation.requiresHiddenSampling,
      metricCache: new Map<string, number>(),
      victorySurface: null,
    };
  } catch {
    return { kind: 'unknown', reason: 'failed' };
  }
}
```

`classifyPreviewOutcome` becomes a thin wrapper:

```typescript
function classifyPreviewOutcome(classification: PlayableCandidateClassification): PreviewOutcome {
  return classification.kind !== 'playableComplete'
    ? { kind: 'unknown', reason: 'unresolved' }
    : tryApplyPreview(classification.move);
}
```

Key design decisions:
- Uses `deps.applyMove` (injected dependency), consistent with the existing DI pattern — not `applyTrustedMove` directly
- Adds `sourceStateHash` validation (F5 safety invariant, cheap bigint comparison) — catches bugs where a trusted move is applied against a state it wasn't completed for
- Shares the RNG-check and observation logic with the original path — no duplication

#### 3. Modify `getPreviewOutcome` in `policy-preview.ts`

```typescript
function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
  const cached = cache.get(candidate.stableMoveKey);
  if (cached !== undefined) {
    return cached;
  }

  const trusted = trustedMoveIndex.get(candidate.stableMoveKey);
  const outcome = trusted !== undefined
    ? tryApplyPreview(trusted)
    : classifyPreviewOutcome(
        deps.classifyPlayableMoveCandidate(input.def, input.state, candidate.move, input.runtime),
      );

  cache.set(candidate.stableMoveKey, outcome);
  return outcome;
}
```

The trusted fast-path and the original classification path both resolve to `PreviewOutcome` through `tryApplyPreview`. Caching is unchanged — the outcome is cached by `stableMoveKey` regardless of path.

#### 4. Thread `trustedMoveIndex` from `PolicyAgent` through evaluation

**In `EvaluatePolicyMoveInput`** (`policy-eval.ts`):

```typescript
export interface EvaluatePolicyMoveInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly legalMoves: readonly Move[];
  readonly rng: Rng;
  readonly runtime?: GameDefRuntime;
  readonly fallbackOnError?: boolean;
  readonly profileIdOverride?: string;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;  // NEW — required
}
```

**In `CreatePolicyRuntimeProvidersInput`** (`policy-runtime.ts`):

```typescript
export interface CreatePolicyRuntimeProvidersInput {
  // ... existing fields ...
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;  // NEW — required
}
```

Forwarded to `createPolicyPreviewRuntime` in `createPolicyRuntimeProviders`.

**In `PolicyAgent.chooseMove`** (`policy-agent.ts`):

```typescript
const playableMoves = prepared.completedMoves.length > 0
  ? prepared.completedMoves
  : prepared.stochasticMoves;

const trustedMoveIndex = new Map(
  playableMoves.map(tm => [toMoveIdentityKey(input.def, tm.move), tm]),
);

const result = evaluatePolicyMove({
  ...input,
  legalMoves: playableMoves.map(m => m.move),
  rng: prepared.rng,
  trustedMoveIndex,
  // ... other fields ...
});
```

#### 5. No changes to candidate types or kernel code

The following types remain unchanged:
- `PolicyPreviewCandidate` — still `{ move: Move; stableMoveKey: string }`
- `PolicyRuntimeCandidate` — still `{ move: Move; stableMoveKey: string; actionId: string }`
- `CandidateEntry` — internal to `policy-eval.ts`, unchanged
- All kernel types and functions — untouched

### Stochastic Move Handling

`PolicyAgent.chooseMove` uses `completedMoves` when available, falling back to `stochasticMoves`. The `trustedMoveIndex` is built from whichever array is selected. For stochastic moves:

- The index still contains `TrustedExecutableMove` wrappers (provenance: `'templateCompletion'`)
- `tryApplyPreview` applies them, but the RNG-changed check will return `{ kind: 'unknown', reason: 'random' }` if the move consumes RNG
- This is correct behavior — stochastic moves legitimately cannot be previewed deterministically
- The fast-path still avoids the redundant re-probe via `probeMoveViability`, saving computation even when preview is ultimately `unknown`

### Safety Analysis

**Determinism (F5)**: Preserved. The trusted move is the same move that was completed — same decisions, same RNG consumption. Preview applies it deterministically. The RNG-changed check still rejects non-deterministic outcomes. The new `sourceStateHash` assertion provides an additional F5 safety net.

**Visibility (Spec 15 §Visibility)**: Preserved. Preview still masks hidden information through `getPolicySurfaceVisibility` and `isSurfaceVisibilityAccessible`. The change only affects whether preview can produce a state to inspect, not what it exposes from that state.

**Bounded computation (F6)**: Preserved. Completion is already bounded by `completionsPerTemplate`. Preview applies each completed move once — `O(completedMoves)` applications, each bounded by the effect tree depth.

**Engine agnosticism (F1)**: Preserved. All changes are in `packages/engine/src/agents/` — the kernel is untouched.

**No search (Spec 15 §V1)**: Preserved. This is still one-ply evaluation of concrete moves. The moves are concrete because they've been completed. No template expansion happens inside the evaluator.

**Immutability (F7)**: Preserved. The `trustedMoveIndex` is a `ReadonlyMap`. `tryApplyPreview` returns new state objects via `deps.applyMove`.

**No backwards compatibility shims (F9)**: Enforced. `trustedMoveIndex` is required on `EvaluatePolicyMoveInput`, not optional. All callers (production and test) are updated in the same change. Tests that don't exercise preview pass an empty map.

### Performance Impact

**Additional cost**: One `deps.applyMove` call per completed candidate that survives pruning (preview is lazy, computed only when a `preview.*` ref is evaluated). For FITL with ~120 completed moves per decision point (40 templates × 3 completions), this adds ~120 move applications.

**Savings**: The fast-path avoids `classifyPlayableMoveCandidate` → `probeMoveViability` for every candidate — a meaningful saving since `probeMoveViability` validates action preconditions, decision sequences, and turn flow windows.

**Mitigation**: Preview is already cached per `stableMoveKey`. Lazy evaluation means only candidates that reach the scoring phase (post-pruning) incur preview cost. The FITL campaign showed that pruning removes ~50% of candidates before scoring.

**Benchmark requirement**: Before merging, run the FITL performance campaign harness to verify no regression beyond 5% in combined_duration_ms.

## Deliverables

### Source changes

| File | Change |
|------|--------|
| `packages/engine/src/agents/policy-preview.ts` | Add `trustedMoveIndex` to `CreatePolicyPreviewRuntimeInput`, extract `tryApplyPreview` (with `sourceStateHash` guard), update `getPreviewOutcome` with index-lookup fast-path, reduce `classifyPreviewOutcome` to thin wrapper |
| `packages/engine/src/agents/policy-eval.ts` | Add required `trustedMoveIndex` to `EvaluatePolicyMoveInput`, pass through to `createPolicyRuntimeProviders` |
| `packages/engine/src/agents/policy-runtime.ts` | Add required `trustedMoveIndex` to `CreatePolicyRuntimeProvidersInput`, forward to `createPolicyPreviewRuntime` |
| `packages/engine/src/agents/policy-agent.ts` | Build `trustedMoveIndex` map from selected playable moves, pass to `evaluatePolicyMove` |

### Test changes

| Test | Purpose |
|------|---------|
| `test/unit/agents/policy-preview.test.ts` | New: verify trusted index fast-path produces `ready` outcome for completed FITL moves; verify `sourceStateHash` mismatch returns `failed` |
| `test/unit/agents/policy-eval.test.ts` | Update: all 7 existing callsites updated to pass `trustedMoveIndex` (empty map where preview is not under test) |
| `test/unit/property/policy-determinism.test.ts` | Update: 3 callsites updated to pass `trustedMoveIndex` |
| `test/unit/property/policy-visibility.test.ts` | Update: 2 callsites updated to pass `trustedMoveIndex` |
| `test/unit/trace/policy-trace-events.test.ts` | Update: 1 callsite updated to pass `trustedMoveIndex` |
| `test/unit/agents/policy-production-golden.test.ts` | Update: FITL policy summary golden will change (scores now reflect projected margins) |
| `test/integration/policy-agent-preview.test.ts` | New: end-to-end test — compile FITL spec, enumerate+complete moves, verify PolicyAgent scores differ across candidates of the same action type |

### Golden fixture updates

The FITL policy catalog golden (`fitl-policy-catalog.golden.json`) is unchanged — no compilation changes. The FITL policy summary golden (`fitl-policy-summary.golden.json`) will change because the agent now scores using actual projected margins instead of fallback constants.

## Acceptance Criteria

1. For FITL, `PolicyAgent` decision traces show `unknownRefIds: []` (empty) for completed moves that don't involve randomness
2. Different parameterizations of the same FITL action produce different `projectedSelfMargin` values
3. All existing engine tests pass (with test callsite updates for required `trustedMoveIndex`)
4. Performance benchmark: FITL 15-seed tournament completes within 110% of current duration
5. Texas Hold'em policy evaluation is unchanged (Texas moves are already `playableComplete` or legitimately `unknown` due to hidden information)
6. No kernel source files modified
7. `sourceStateHash` mismatch in `tryApplyPreview` returns `{ kind: 'unknown', reason: 'failed' }` (tested)
