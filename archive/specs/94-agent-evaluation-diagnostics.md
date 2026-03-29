# Spec 94: Agent Evaluation Diagnostic Pipeline

**Status**: COMPLETED
**Priority**: P2
**Complexity**: S
**Dependencies**: Spec 15 (implemented), Spec 93 (implemented)
**Estimated effort**: 1-2 days
**Origin**: FITL VC agent evolution campaign — preview failure was invisible until manual diagnostic scripts were written. The agent decision trace lacked classification breakdowns, making it impossible to determine WHY preview returned `unknown`.

## Problem Statement

The PolicyAgent's decision trace (`AgentDecisionTrace`) reports what the agent chose and how it scored, but not **why preview failed**. The `previewUsage` field reports `refIds` and `unknownRefs` (per-ref reason), but does not explain the aggregate failure profile:

- Of N evaluated candidates, how many resolved to a usable preview state?
- How many failed because the move involved randomness (`random`)? Hidden information sampling (`hidden`)? Unresolved decisions (`unresolved`)? Apply errors (`failed`)?
- How many candidates were completed vs rejected during `preparePlayableMoves`?
- What was the completion success rate?
- For a specific candidate, what was its preview outcome?

Without this information, diagnosing agent behavior requires writing ad-hoc scripts that replicate the agent's internal flow — exactly what the FITL VC campaign required.

This spec adds structured diagnostic output to the agent evaluation path so that trace consumers (campaign harnesses, the CLI, the runner) can inspect the full decision pipeline.

## Goals

- Make preview failure modes observable in the standard agent decision trace
- Make move completion statistics observable
- Enable campaign harnesses to detect and categorize preview failures without ad-hoc scripts
- Maintain trace backward compatibility (new fields are additive)
- Keep diagnostic overhead opt-in (verbose mode only for expensive fields)

## Non-Goals

- Changing preview behavior (that is Spec 93, now implemented)
- Adding interactive debugging or breakpoint facilities
- Real-time monitoring or streaming diagnostics
- Changing the trace serialization format

## Proposed Design

### 1. Extend `previewUsage` with outcome breakdown

The existing `PolicyPreviewUsageTrace` on policy decision traces:

```typescript
// packages/engine/src/kernel/types-core.ts
interface PolicyPreviewUsageTrace {
  readonly evaluatedCandidateCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefs: readonly PolicyPreviewUnknownRefTrace[];
}
```

Add an aggregate outcome breakdown:

```typescript
// packages/engine/src/kernel/types-core.ts (trace-serialized shape)
interface PolicyPreviewUsageTrace {
  readonly evaluatedCandidateCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefs: readonly PolicyPreviewUnknownRefTrace[];
  // NEW: aggregate counts of preview outcome classifications
  readonly outcomeBreakdown?: PolicyPreviewOutcomeBreakdownTrace;
}

interface PolicyPreviewOutcomeBreakdownTrace {
  readonly ready: number;
  readonly unknownRandom: number;
  readonly unknownHidden: number;
  readonly unknownUnresolved: number;
  readonly unknownFailed: number;
}
```

These 5 categories directly mirror the code:
- `ready` — `PreviewOutcome.kind === 'ready'` (line 79, `policy-preview.ts`)
- `unknownRandom` — `PreviewOutcome.reason === 'random'` (RNG changed after apply, line 209)
- `unknownHidden` — `PreviewOutcome.reason === 'hidden'` (hidden information sampling required)
- `unknownUnresolved` — `PreviewOutcome.reason === 'unresolved'` (not decision-complete, line 190)
- `unknownFailed` — `PreviewOutcome.reason === 'failed'` (apply threw or hash mismatch, lines 198/221)

This tells consumers: "of N evaluated candidates, X resolved to usable preview state, Y failed because of randomness, Z failed because of hidden information."

### 2. Add `completionStatistics` to `PolicyAgentDecisionTrace`

Add a new optional field to the policy decision trace. Statistics are **move-centric**, directly mirroring what `preparePlayableMoves` actually does:

```typescript
// packages/engine/src/agents/prepare-playable-moves.ts (agent layer)
interface PolicyCompletionStatistics {
  readonly totalClassifiedMoves: number;
  readonly completedCount: number;
  readonly stochasticCount: number;
  readonly rejectedNotViable: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionUnsatisfiable: number;
}
```

Fields track the actual classification flow in `preparePlayableMoves`:
- `totalClassifiedMoves` — total moves entering the function
- `completedCount` — moves with `viability.complete === true` (line 66)
- `stochasticCount` — moves with `viability.stochasticDecision !== undefined` (line 73)
- `rejectedNotViable` — moves with `!viability.viable` that don't qualify for zone-filter fallthrough
- `templateCompletionAttempts` — total calls to `evaluatePlayableMoveCandidate` (line 109)
- `templateCompletionSuccesses` — results with `kind === 'playableComplete'` (line 112)
- `templateCompletionUnsatisfiable` — results with `rejection === 'completionUnsatisfiable'` (line 120)

Trace-serialized shape in `types-core.ts`:

```typescript
// packages/engine/src/kernel/types-core.ts
interface PolicyAgentDecisionTrace {
  // ... existing fields ...
  readonly completionStatistics?: PolicyCompletionStatisticsTrace;
}

interface PolicyCompletionStatisticsTrace {
  readonly totalClassifiedMoves: number;
  readonly completedCount: number;
  readonly stochasticCount: number;
  readonly rejectedNotViable: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionUnsatisfiable: number;
}
```

### 3. Add per-candidate preview outcome (verbose only)

Add an optional field to `PolicyCandidateDecisionTrace`:

```typescript
// packages/engine/src/kernel/types-core.ts
interface PolicyCandidateDecisionTrace {
  // ... existing fields ...
  readonly previewOutcome?: 'ready' | 'random' | 'hidden' | 'unresolved' | 'failed';
}
```

This lets campaign harnesses see exactly which candidates failed preview and why — at the individual candidate level, not just aggregate. The outcome is already cached in the preview runtime's `Map<string, PreviewOutcome>` — it just needs to be exposed to the eval layer.

### 4. Trace level gating

Using the existing `PolicyDecisionTraceLevel = 'summary' | 'verbose'`:

- **`summary` level** (default): Include `outcomeBreakdown` (cheap — just summarize the preview cache). Exclude `completionStatistics` and per-candidate `previewOutcome`.
- **`verbose` level**: Include all: `outcomeBreakdown`, `completionStatistics`, and per-candidate `previewOutcome`.

This keeps the default trace lightweight while making full diagnostics available when needed.

### 5. Implementation path

#### In `policy-preview.ts`

The preview runtime already caches outcomes in `cache: Map<string, PreviewOutcome>`. Add a summary function that reads the cache and counts by outcome kind/reason:

```typescript
// NOT a method on PolicyPreviewRuntime — a standalone export
export function summarizePreviewOutcomes(
  cache: ReadonlyMap<string, PreviewOutcome>,
): PolicyPreviewOutcomeBreakdown {
  const breakdown = { ready: 0, unknownRandom: 0, unknownHidden: 0, unknownUnresolved: 0, unknownFailed: 0 };
  for (const outcome of cache.values()) {
    if (outcome.kind === 'ready') breakdown.ready++;
    else if (outcome.reason === 'random') breakdown.unknownRandom++;
    else if (outcome.reason === 'hidden') breakdown.unknownHidden++;
    else if (outcome.reason === 'unresolved') breakdown.unknownUnresolved++;
    else breakdown.unknownFailed++;
  }
  return breakdown;
}
```

To expose the cache for summarization, `createPolicyPreviewRuntime` returns an extended object with a `getOutcomeCache()` accessor (not on the public `PolicyPreviewRuntime` interface — on the concrete return type used internally by the agent layer).

#### In `prepare-playable-moves.ts`

Add counters alongside the existing classification loop:

```typescript
interface PreparedPlayableMoves {
  readonly completedMoves: readonly TrustedExecutableMove[];
  readonly stochasticMoves: readonly TrustedExecutableMove[];
  readonly rng: Rng;
  readonly statistics?: PolicyCompletionStatistics;  // NEW
}
```

Track `totalClassifiedMoves`, `completedCount`, `stochasticCount`, `rejectedNotViable`, `templateCompletionAttempts`, `templateCompletionSuccesses`, `templateCompletionUnsatisfiable` as local variables in the main loop and `attemptTemplateCompletion`.

#### In `policy-eval.ts`

- Accept preview outcome cache from runtime
- For each candidate, look up its `stableMoveKey` in the cache to get `previewOutcome`
- Include in `PolicyEvaluationCandidateMetadata`
- Summarize outcome breakdown from cache into `PolicyEvaluationPreviewUsage`

#### In `policy-diagnostics.ts`

Thread the new statistics into `buildPolicyAgentDecisionTrace`:

```typescript
export function buildPolicyAgentDecisionTrace(
  metadata: PolicyEvaluationMetadata,
  traceLevel: PolicyDecisionTraceLevel = 'summary',
): PolicyAgentDecisionTrace {
  return {
    // ... existing fields ...
    previewUsage: {
      ...metadata.previewUsage,
      outcomeBreakdown: metadata.previewUsage.outcomeBreakdown,  // always included
    },
    ...(traceLevel === 'verbose' ? {
      candidates: metadata.candidates,
      completionStatistics: metadata.completionStatistics,
    } : {}),
  };
}
```

## Deliverables

### Source changes

| File | Change |
|------|--------|
| `packages/engine/src/agents/policy-preview.ts` | Export `summarizePreviewOutcomes()`. Extend `createPolicyPreviewRuntime` return to expose outcome cache. |
| `packages/engine/src/agents/policy-eval.ts` | Collect preview outcome breakdown from cache. Thread per-candidate `previewOutcome` into candidate metadata. Add `outcomeBreakdown` to `PolicyEvaluationPreviewUsage`. |
| `packages/engine/src/agents/prepare-playable-moves.ts` | Track and return `PolicyCompletionStatistics` on `PreparedPlayableMoves`. |
| `packages/engine/src/agents/policy-diagnostics.ts` | Include `outcomeBreakdown` at summary level, `completionStatistics` and per-candidate `previewOutcome` at verbose level. |
| `packages/engine/src/kernel/types-core.ts` | Add trace-serialized types: `PolicyPreviewOutcomeBreakdownTrace`, `PolicyCompletionStatisticsTrace`, `outcomeBreakdown?` on `PolicyPreviewUsageTrace`, `completionStatistics?` on `PolicyAgentDecisionTrace`, `previewOutcome?` on `PolicyCandidateDecisionTrace`. |

### Test changes

| Test | Purpose |
|------|---------|
| `test/unit/policy-diagnostics.test.ts` | Verify outcome breakdown appears in traces at summary level. Verify completionStatistics appears only at verbose level. Verify per-candidate previewOutcome appears only at verbose level. |
| `test/unit/prepare-playable-moves.test.ts` | Verify completion statistics counts are accurate across all classification paths (complete, stochastic, rejected, template completion). |
| `test/unit/policy-preview.test.ts` | Verify `summarizePreviewOutcomes` correctly counts each outcome category. |

### Schema changes

`AgentDecisionTrace` schema in `packages/engine/schemas/` updated to include new optional fields:
- `PolicyPreviewUsageTrace.outcomeBreakdown` (optional object)
- `PolicyAgentDecisionTrace.completionStatistics` (optional object)
- `PolicyCandidateDecisionTrace.previewOutcome` (optional enum string)

## FOUNDATIONS Alignment

- **F1 (Engine Agnosticism)**: Pure observability — no game-specific logic. Diagnostic types are generic. Agent-layer types stay in agent modules.
- **F5 (Determinism)**: No behavioral changes. Diagnostics are read-only metadata computed alongside existing operations.
- **F7 (Immutability)**: Diagnostic accumulators are local to the evaluation scope. The preview cache is read-only when summarized.
- **F9 (No Backwards Compatibility)**: New fields are additive to the trace. Existing consumers ignore unknown fields. No aliases or shims.
- **F11 (Testing as Proof)**: The diagnostics themselves are testable. They also make policy behavior provable — consumers can assert on preview success rates.
- **F12 (Branded Types)**: No new domain IDs introduced; existing branded types remain unchanged.

## Acceptance Criteria

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - The diagnostic pipeline described here was already implemented in the codebase before this ticket pass.
  - Policy trace types, zod schema definitions, generated JSON Schema artifacts, and diagnostic tests already included `previewUsage.outcomeBreakdown`, verbose `completionStatistics`, and candidate `previewOutcome`.
  - This completion pass strengthened explicit AJV trace-schema validation coverage for those fields in `packages/engine/test/unit/json-schema.test.ts`.
- Deviations from original plan:
  - No new agent-layer implementation work was required during this pass.
  - The only code change was stronger schema-proof coverage, because the production architecture already matched the spec intent.
- Verification results:
  - `pnpm -F @ludoforge/engine schema:artifacts:check` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo test` passed.

1. FITL policy traces at `verbose` level show `outcomeBreakdown` with counts matching the actual preview cache state
2. FITL policy traces at `verbose` level show `completionStatistics` with accurate counts
3. FITL policy traces at `verbose` level show per-candidate `previewOutcome` values
4. `summary` level traces include `outcomeBreakdown` but not `completionStatistics` or per-candidate `previewOutcome`
5. All existing tests pass without modification
6. Trace JSON remains backward-compatible (new fields only, no removed fields)
7. No measurable performance impact at `summary` trace level (< 1% overhead)
