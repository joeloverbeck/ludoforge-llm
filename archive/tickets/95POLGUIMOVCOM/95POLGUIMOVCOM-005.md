# 95POLGUIMOVCOM-005: Add completion-context runtime resolution for `decisionIntrinsic` and `optionIntrinsic`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents policy-runtime, agents policy-eval
**Deps**: archive/tickets/95POLGUIMOVCOM-002.md

## Problem

The compiled policy surface already includes `decisionIntrinsic` and `optionIntrinsic`, and the expression layer already accepts them. The runtime evaluation layer still does not resolve them:

- `policy-eval.ts` returns `undefined` for both ref kinds unconditionally
- `PolicyRuntimeProviders` has no completion-context provider

As a result, any completion score term that references `decision.*` or `option.*` compiles successfully but cannot evaluate correctly at runtime.

## Assumption Reassessment (2026-03-30)

1. Ticket `002` already delivered the authored/compiled/catalog support for `completionScoreTerms`, `completionGuidance`, `decisionIntrinsic`, and `optionIntrinsic`. Confirmed.
2. `compile-agents.ts` already lowers `decision.type`, `decision.name`, `decision.targetKind`, `decision.optionCount`, and `option.value`. Confirmed.
3. `AgentPolicyExpr` and the evaluator path already support dynamic `zoneTokenAgg.zone: string | AgentPolicyExpr`. This ticket must not re-scope that as new work. Confirmed.
4. `prepare-playable-moves.ts` already accepts and threads an optional `choose` callback into `evaluatePlayableMoveCandidate`. This ticket must not claim chooser plumbing as new work. Confirmed.
5. The real remaining gap is runtime completion context: there is currently no provider slot for decision/option metadata, and `policy-eval.ts` hard-codes these refs to `undefined`. Confirmed.
6. `ChoicePendingRequest` provides the needed generic metadata:
   - `type`
   - `name`
   - `targetKinds`
   - `options`
   The current option value being scored is supplied separately at evaluation time. Confirmed.

## Architecture Check

1. Cleanest approach: extend `PolicyRuntimeProviders` with an optional `completion` sub-provider rather than overloading candidate providers or inventing a parallel ref-resolution path.
2. `createPolicyRuntimeProviders(...)` should accept an optional completion-context input and produce the optional provider when present. Existing call sites remain unchanged because the new input is optional.
3. `policy-eval.ts` should resolve `decisionIntrinsic` / `optionIntrinsic` through `runtimeProviders.completion` when present, and otherwise return `undefined`. This keeps the current evaluator architecture intact while making the new ref kinds usable.
4. This is architecturally better than duplicating expression resolution in a completion-only evaluator. A later completion scorer can reuse the same provider contract instead of re-encoding decision/option semantics.

## Scope Correction

This ticket is narrower than the original wording implied.

- In scope here:
  - add completion-context provider support to `PolicyRuntimeProviders`
  - add factory/helper support for building that provider from `ChoicePendingRequest` plus the current option value
  - make the evaluator resolve `decisionIntrinsic` / `optionIntrinsic` through that provider
  - add focused unit coverage for the runtime resolution behavior
- Out of scope here:
  - scoring completion options against `completionScoreTerms` as a standalone API (ticket `007`)
  - building and threading the `PolicyAgent` completion chooser (ticket `008`)
  - compiler/schema work already delivered by ticket `002`

## What to Change

### 1. `policy-runtime.ts` — add optional completion provider support

Add an optional completion provider contract alongside the existing runtime provider buckets:

```typescript
export interface PolicyCompletionProvider {
  resolveDecisionIntrinsic(intrinsic: 'type' | 'name' | 'targetKind' | 'optionCount'): PolicyValue;
  resolveOptionIntrinsic(intrinsic: 'value'): PolicyValue;
}
```

Add:

```typescript
readonly completion?: PolicyCompletionProvider;
```

to `PolicyRuntimeProviders`.

### 2. `policy-runtime.ts` — add completion-context factory support

Provide a helper that builds a completion provider from:

- a `ChoicePendingRequest`
- the current `MoveParamValue` being scored

Resolution rules:

- `decision.type` -> `request.type`
- `decision.name` -> `request.name`
- `decision.targetKind` -> first entry in `request.targetKinds`, otherwise `'unknown'`
- `decision.optionCount` -> `request.options.length`
- `option.value` -> the provided option value

Keep this helper generic and pure.

### 3. `policy-runtime.ts` — allow `createPolicyRuntimeProviders(...)` to include completion context

Extend `CreatePolicyRuntimeProvidersInput` with an optional completion payload, for example:

```typescript
readonly completion?: {
  readonly request: ChoicePendingRequest;
  readonly optionValue: MoveParamValue;
};
```

When present, `createPolicyRuntimeProviders(...)` should attach the derived `completion` provider. When absent, existing behavior is unchanged.

### 4. `policy-eval.ts` — route completion refs through the provider

In `resolveRef(...)`:

- `decisionIntrinsic` -> `this.runtimeProviders.completion?.resolveDecisionIntrinsic(...)`
- `optionIntrinsic` -> `this.runtimeProviders.completion?.resolveOptionIntrinsic(...)`

If no completion provider exists, return `undefined`.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify or extend)

## Out of Scope

- New completion-scoring module or scorer API
- `PolicyAgent` chooser construction or fallback handling
- Refactoring the whole expression evaluator out of `policy-eval.ts`
- Any compiler/schema/catalog work already completed elsewhere

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `decisionIntrinsic.type` resolves to `'chooseOne'` when completion context is provided
2. New unit test: `decisionIntrinsic.targetKind` resolves to the first target kind and falls back to `'unknown'` when empty
3. New unit test: `decisionIntrinsic.optionCount` resolves to the request option count
4. New unit test: `optionIntrinsic.value` resolves to the current option value
5. New unit test: when completion context is absent, `decisionIntrinsic` and `optionIntrinsic` resolve to `undefined`
6. Existing suite: relevant `policy-eval` and `policy-agent` tests still pass
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Existing seat/turn/candidate/current-surface/preview-surface resolution remains unchanged.
2. Completion-context resolution is optional and pure.
3. Foundation #1 (Engine Agnosticism): completion refs map only to generic `ChoicePendingRequest` metadata and option values.
4. Foundation #5 (Determinism): same request + same option value = same resolved runtime values.
5. Foundation #10 (Architectural Completeness): compiled completion refs are no longer silently unsupported at runtime.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — extend runtime-provider coverage for completion refs

### Commands

1. Focused engine unit tests covering policy runtime/eval completion refs
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine typecheck`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completed: 2026-03-30
- What actually changed:
  - Added an optional `completion` provider bucket to `PolicyRuntimeProviders`.
  - Added `createPolicyCompletionProvider(...)` plus optional completion input support in `createPolicyRuntimeProviders(...)`.
  - Routed `decisionIntrinsic` and `optionIntrinsic` through the completion provider in `policy-eval.ts` instead of hard-coding them to `undefined`.
  - Added focused unit coverage for completion-context runtime resolution, including the `targetKind -> 'unknown'` fallback and the no-context path.
  - Normalized `option.value` to the policy runtime's supported literal space, so scalar values and string lists resolve while unsupported list shapes remain `undefined`.
- Deviations from original plan:
  - The corrected ticket narrowed scope to runtime-provider/evaluator integration only because compiler/schema/lowering work had already been delivered elsewhere.
  - The implementation exposed a type-surface constraint that the original ticket did not mention: not every `MoveParamValue` is representable as a `PolicyValue`, so `option.value` resolution now preserves only policy-supported literal forms.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
