# 94AGEEVADIA-001: Add diagnostic trace types to types-core.ts

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agent diagnostics pipeline, trace-serialized kernel shapes, schema validation
**Deps**: Spec 94 (draft), Spec 93 (implemented)

## Problem

The `PolicyAgentDecisionTrace` and related trace interfaces lack fields for preview outcome breakdown, completion statistics, and per-candidate preview outcome. More importantly, the current agent pipeline does not yet compute or thread that diagnostic data into evaluation metadata or trace serialization. A type-only patch would leave the spec unmet and produce dead fields.

## Assumption Reassessment (2026-03-29)

1. `PolicyPreviewUsageTrace`, `PolicyCandidateDecisionTrace`, and `PolicyAgentDecisionTrace` exist in `packages/engine/src/kernel/types-core.ts` — **confirmed**.
2. Matching Zod schemas exist in `packages/engine/src/kernel/schemas-core.ts` — **confirmed**. The ticket previously omitted this and would have left runtime trace validation stale.
3. `buildPolicyAgentDecisionTrace()` currently just copies `metadata.previewUsage` and conditionally includes `candidates`; it does not gate or thread `completionStatistics` — **confirmed**.
4. `preparePlayableMoves()` currently returns only `{ completedMoves, stochasticMoves, rng }`; no completion counters are produced today — **confirmed**.
5. `createPolicyPreviewRuntime()` currently hides preview-outcome cache details behind a `resolveSurface()`-only interface — **confirmed**. The ticket previously assumed a hidden concrete return extension; that is avoidable.
6. `policy-eval.ts` already owns candidate-level preview reference tracking and preview-usage summarization, so it is the right place to thread aggregate preview diagnostics once the preview runtime exposes them cleanly — **confirmed**.

## Architecture Check

1. This should remain an end-to-end diagnostics change, not a types-only patch. The architecture value is in making the trace truthful, not merely widenable.
2. The preview runtime should expose diagnostics through its public interface, not via an undocumented concrete return shape. The cleaner boundary is to add explicit read-only introspection methods for preview outcome lookup and aggregate summarization.
3. All new diagnostics remain generic and game-agnostic. They describe policy-evaluation outcomes, not game rules.
4. No compatibility shims or aliases. We add the new fields and update all trace producers/validators in the same change.

## What to Change

### 1. Add preview-outcome and completion-statistics trace types

New interfaces in `types-core.ts` near the existing policy trace shapes:

```typescript
export interface PolicyPreviewOutcomeBreakdownTrace {
  readonly ready: number;
  readonly unknownRandom: number;
  readonly unknownHidden: number;
  readonly unknownUnresolved: number;
  readonly unknownFailed: number;
}
export interface PolicyCompletionStatisticsTrace {
  readonly totalClassifiedMoves: number;
  readonly completedCount: number;
  readonly stochasticCount: number;
  readonly rejectedNotViable: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionUnsatisfiable: number;
}
```

### 2. Extend the trace shapes and matching schemas

Update both `types-core.ts` and `schemas-core.ts`:

```typescript
export interface PolicyPreviewUsageTrace {
  // ... existing fields ...
  readonly outcomeBreakdown?: PolicyPreviewOutcomeBreakdownTrace;
}

export interface PolicyAgentDecisionTrace {
  // ... existing fields ...
  readonly completionStatistics?: PolicyCompletionStatisticsTrace;
}

export interface PolicyCandidateDecisionTrace {
  // ... existing fields ...
  readonly previewOutcome?: 'ready' | 'random' | 'hidden' | 'unresolved' | 'failed';
}
```

### 3. Thread diagnostics through the agent pipeline

- `prepare-playable-moves.ts`: return completion statistics alongside prepared moves.
- `policy-preview.ts`: expose preview-outcome diagnostics through the runtime interface and provide aggregate summarization.
- `policy-runtime.ts`: pass the richer preview runtime through the provider boundary.
- `policy-eval.ts`: attach per-candidate preview outcome, outcome breakdown, and completion statistics to evaluation metadata.
- `policy-diagnostics.ts`: gate fields by trace level per Spec 94.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts`
- `packages/engine/src/agents/policy-preview.ts`
- `packages/engine/src/agents/policy-runtime.ts`
- `packages/engine/src/agents/policy-eval.ts`
- `packages/engine/src/agents/policy-diagnostics.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/test/unit/prepare-playable-moves.test.ts`
- `packages/engine/test/unit/agents/policy-preview.test.ts`
- `packages/engine/test/unit/trace/policy-trace-events.test.ts`
- `packages/engine/test/unit/agents/policy-agent.test.ts`

## Out of Scope

- Changing preview semantics or playable-move legality decisions
- Adding new agent heuristics or score logic
- Changing trace field names proposed by Spec 94
- Modifying existing required fields or removing existing fields

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — diagnostics compile and emitted schemas/types stay in sync
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern \"preparePlayableMoves|policy-preview|policy trace events|policy agent\"` or equivalent targeted unit coverage
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine typecheck`
5. `pnpm turbo test`

### Invariants

1. `PolicyPreviewOutcomeBreakdownTrace` field names exactly match the spec: `ready`, `unknownRandom`, `unknownHidden`, `unknownUnresolved`, `unknownFailed`.
2. `PolicyCompletionStatisticsTrace` field names exactly match the spec: `totalClassifiedMoves`, `completedCount`, `stochasticCount`, `rejectedNotViable`, `templateCompletionAttempts`, `templateCompletionSuccesses`, `templateCompletionUnsatisfiable`.
3. `previewOutcome` union is exactly `'ready' | 'random' | 'hidden' | 'unresolved' | 'failed'`.
4. `summary` traces include `previewUsage.outcomeBreakdown` but omit `completionStatistics` and per-candidate `previewOutcome`.
5. `verbose` traces include `previewUsage.outcomeBreakdown`, `completionStatistics`, and per-candidate `previewOutcome`.
6. Schemas validate the new optional fields without widening unrelated trace contracts.

## Test Plan

### New/Modified Tests

- `packages/engine/test/unit/agents/policy-preview.test.ts`
  - add coverage for preview-outcome lookup and aggregate outcome breakdown across `ready`, `random`, `hidden`, `unresolved`, and `failed`
- `packages/engine/test/unit/prepare-playable-moves.test.ts`
  - add coverage for completion-statistics counting across complete, stochastic, rejected, template-completed, and completion-unsatisfiable paths
- `packages/engine/test/unit/trace/policy-trace-events.test.ts`
  - add coverage for summary vs verbose trace gating of `outcomeBreakdown`, `completionStatistics`, and candidate `previewOutcome`
- `packages/engine/test/unit/agents/policy-agent.test.ts`
  - strengthen production-path coverage so completed template candidates expose the new preview diagnostics

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern \"preparePlayableMoves|policy-preview|policy trace events|policy agent\"`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine typecheck`
5. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Added the new policy trace fields and trace types in `types-core.ts`.
  - Updated `schemas-core.ts` and regenerated the schema artifacts so trace validation matches the new contract.
  - Threaded completion statistics through `preparePlayableMoves()`, policy evaluation metadata, and verbose policy traces.
  - Threaded per-candidate preview outcomes and aggregate preview outcome breakdowns into policy evaluation and summary/verbose traces.
  - Added and strengthened unit, integration, and golden tests for the new diagnostics.
- Deviations from original plan:
  - The original ticket under-scoped the work as type-only and explicitly excluded schema/runtime/test updates. The implemented change corrected that and updated the whole diagnostics path.
  - The final design does not expose a public preview-runtime aggregate summarizer. Aggregate `outcomeBreakdown` is computed from evaluated candidate metadata instead, because `hidden` is only knowable once concrete preview refs are resolved.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `node --test --test-concurrency=1 packages/engine/dist/test/unit/prepare-playable-moves.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/unit/policy-production-golden.test.js` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo test` passed.
