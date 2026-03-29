# Spec 94: Agent Evaluation Diagnostic Pipeline

**Status**: Draft
**Priority**: P2
**Complexity**: S
**Dependencies**: Spec 15 (implemented), Spec 93 (recommended but not required)
**Estimated effort**: 1-2 days
**Origin**: FITL VC agent evolution campaign — preview failure was invisible until manual diagnostic scripts were written. The agent decision trace lacked classification breakdowns, making it impossible to determine WHY preview returned `unknown`.

## Problem Statement

The PolicyAgent's decision trace (`AgentDecisionTrace`) reports what the agent chose and how it scored, but not **why preview failed**. The `previewUsage` field reports `refIds` and `unknownRefIds`, but does not explain the failure path:

- Was the candidate classified as `playableComplete`, `playableStochastic`, or `rejected`?
- If `rejected`, was it `notViable`, `notDecisionComplete`, or `completionUnsatisfiable`?
- If preview reached the apply step, did the RNG change? Did the apply throw?
- How many candidates were completed vs rejected during `preparePlayableMoves`?
- What was the completion success rate per template?

Without this information, diagnosing agent behavior requires writing ad-hoc scripts that replicate the agent's internal flow — exactly what the FITL VC campaign required.

This spec adds structured diagnostic output to the agent evaluation path so that trace consumers (campaign harnesses, the CLI, the runner) can inspect the full decision pipeline.

## Goals

- Make preview failure modes observable in the standard agent decision trace
- Make move completion statistics observable
- Enable campaign harnesses to detect and categorize preview failures without ad-hoc scripts
- Maintain trace backward compatibility (new fields are additive)
- Keep diagnostic overhead opt-in (verbose mode only for expensive fields)

## Non-Goals

- Changing preview behavior (that is Spec 93)
- Adding interactive debugging or breakpoint facilities
- Real-time monitoring or streaming diagnostics
- Changing the trace serialization format

## Proposed Design

### 1. Extend `previewUsage` in `AgentDecisionTrace`

The existing `previewUsage` on policy decision traces:

```typescript
interface PolicyPreviewUsage {
  readonly evaluatedCandidateCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefIds: readonly string[];
}
```

Add diagnostic fields:

```typescript
interface PolicyPreviewUsage {
  readonly evaluatedCandidateCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefIds: readonly string[];
  // NEW: breakdown of preview outcome classifications
  readonly outcomeBreakdown?: PolicyPreviewOutcomeBreakdown;
}

interface PolicyPreviewOutcomeBreakdown {
  readonly ready: number;
  readonly unknownUnresolved: number;
  readonly unknownRandom: number;
  readonly unknownFailed: number;
  readonly skippedByPruning: number;
}
```

This tells consumers: "of N evaluated candidates, X resolved to usable preview state, Y failed because the move wasn't decision-complete, Z failed because the move involved randomness."

### 2. Add `completionStatistics` to `AgentDecisionTrace`

Add a new optional field to the policy decision trace:

```typescript
interface PolicyCompletionStatistics {
  readonly templateCount: number;
  readonly completionAttempts: number;
  readonly completedMoves: number;
  readonly stochasticMoves: number;
  readonly unsatisfiableTemplates: number;
  readonly completionsPerTemplate: number;
}
```

This captures what `preparePlayableMoves` did: how many templates it attempted, how many completed successfully, and the configured completions-per-template.

### 3. Trace level gating

- **`summary` level** (default): Include `outcomeBreakdown` (cheap — just counts). Exclude `completionStatistics` (requires tracking in `preparePlayableMoves`).
- **`detailed` level**: Include both `outcomeBreakdown` and `completionStatistics`.

This keeps the default trace lightweight while making full diagnostics available when needed.

### 4. Implementation path

#### In `policy-preview.ts`

Track outcome classifications as they're computed:

```typescript
// Inside createPolicyPreviewRuntime
const outcomes = { ready: 0, unknownUnresolved: 0, unknownRandom: 0, unknownFailed: 0 };

function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
  // ... existing logic ...
  if (outcome.kind === 'ready') outcomes.ready++;
  else if (outcome.reason === 'unresolved') outcomes.unknownUnresolved++;
  else if (outcome.reason === 'random') outcomes.unknownRandom++;
  else outcomes.unknownFailed++;
  // ...
}

// Expose as a method on the runtime
getOutcomeBreakdown(): PolicyPreviewOutcomeBreakdown { return { ...outcomes, skippedByPruning: 0 }; }
```

#### In `prepare-playable-moves.ts`

Track completion statistics:

```typescript
interface PreparedPlayableMoves {
  readonly completedMoves: readonly TrustedExecutableMove[];
  readonly stochasticMoves: readonly TrustedExecutableMove[];
  readonly rng: Rng;
  readonly statistics?: PolicyCompletionStatistics;  // NEW
}
```

#### In `policy-diagnostics.ts`

Thread the new statistics into `buildPolicyAgentDecisionTrace`.

## Deliverables

### Source changes

| File | Change |
|------|--------|
| `packages/engine/src/agents/policy-preview.ts` | Track and expose outcome classification counts |
| `packages/engine/src/agents/policy-eval.ts` | Collect preview outcome breakdown from preview runtime, include in metadata |
| `packages/engine/src/agents/prepare-playable-moves.ts` | Track and return completion statistics |
| `packages/engine/src/agents/policy-diagnostics.ts` | Include new diagnostic fields in trace at appropriate trace levels |
| `packages/engine/src/agents/policy-runtime.ts` | Add `getOutcomeBreakdown` to `PolicyPreviewRuntime` interface |
| `packages/engine/src/kernel/types-core.ts` | Add `PolicyPreviewOutcomeBreakdown` and `PolicyCompletionStatistics` to agent trace types |

### Test changes

| Test | Purpose |
|------|---------|
| `test/unit/policy-diagnostics.test.ts` | Verify outcome breakdown appears in traces at correct verbosity levels |
| `test/unit/prepare-playable-moves.test.ts` | Verify completion statistics are accurate |

### Schema changes

`AgentDecisionTrace` schema in `packages/engine/schemas/` updated to include new optional fields.

## FOUNDATIONS Alignment

- **F1 (Engine Agnosticism)**: Pure observability — no game-specific logic. Diagnostic types are generic.
- **F5 (Determinism)**: No behavioral changes. Diagnostics are read-only metadata computed alongside existing operations.
- **F7 (Immutability)**: Diagnostic accumulators are local to the evaluation scope.
- **F9 (No Backwards Compatibility)**: New fields are additive to the trace. Existing consumers ignore unknown fields. No aliases or shims.
- **F11 (Testing as Proof)**: The diagnostics themselves are testable. They also make policy behavior provable — consumers can assert on preview success rates.

## Acceptance Criteria

1. FITL policy traces at `detailed` level show `outcomeBreakdown` with `unknownUnresolved > 0` (before Spec 93) or `ready > 0` (after Spec 93)
2. FITL policy traces at `detailed` level show `completionStatistics` with accurate counts
3. `summary` level traces include `outcomeBreakdown` but not `completionStatistics`
4. All existing tests pass without modification
5. Trace JSON remains backward-compatible (new fields only, no removed fields)
6. No measurable performance impact at `summary` trace level (< 1% overhead)
