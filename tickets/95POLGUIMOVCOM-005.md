# 95POLGUIMOVCOM-005: Add `decisionIntrinsic` and `optionIntrinsic` reference resolution

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents policy-runtime
**Deps**: archive/tickets/95POLGUIMOVCOM-002.md

## Problem

The policy runtime reference resolver (`policy-runtime.ts`) has no provider for `decisionIntrinsic` or `optionIntrinsic` ref kinds. These are needed by `completionScoreTerms` to access decision metadata (type, name, targetKind, optionCount) and the current option being scored (value). Without this, expressions like `{ ref: decision.targetKind }` or `{ ref: option.value }` cannot resolve.

## Assumption Reassessment (2026-03-30)

1. `PolicyRuntimeProviders` has four sub-providers: `intrinsics`, `candidates`, `currentSurface`, `previewSurface`. No `decision` or `option` provider. Confirmed.
2. Reference resolution dispatches on `ref.kind` — adding new kinds follows the existing pattern. Confirmed.
3. The `decisionIntrinsic` values come from `ChoicePendingRequest` (type, name, targetKinds). The `optionIntrinsic` value comes from the option being scored. These are provided at evaluation time, not at compile time. Confirmed.
4. Resolution providers are created via `createPolicyRuntimeProviders(input)` — the input will need to include the decision/option context when evaluating completion score terms. Confirmed.

## Architecture Check

1. Cleanest approach: add a new optional `completion` sub-provider to `PolicyRuntimeProviders` that resolves `decisionIntrinsic.*` and `optionIntrinsic.*`. When not provided (normal action-type scoring), these refs resolve to `undefined` (unknown). This keeps the existing four providers untouched.
2. Engine agnosticism: `decisionIntrinsic` maps to the kernel's generic `ChoicePendingRequest` fields. `optionIntrinsic.value` is the raw option value (string or number). No game identifiers.
3. No backwards-compatibility shims: the new provider is additive. Existing ref resolution is unchanged.

## What to Change

### 1. `policy-runtime.ts` — add `completion` sub-provider

Add a new optional sub-provider interface:

```typescript
interface CompletionContextProvider {
  resolveDecisionIntrinsic(intrinsic: 'type' | 'name' | 'targetKind' | 'optionCount'): AgentPolicyLiteral | undefined;
  resolveOptionIntrinsic(intrinsic: 'value'): AgentPolicyLiteral | undefined;
}
```

Add to `PolicyRuntimeProviders`:
```typescript
readonly completion?: CompletionContextProvider;
```

### 2. `policy-runtime.ts` — wire into reference resolution

In the ref resolution switch/dispatch:
- `kind: 'decisionIntrinsic'` → delegate to `providers.completion?.resolveDecisionIntrinsic(ref.intrinsic)`. Return `undefined` if provider absent.
- `kind: 'optionIntrinsic'` → delegate to `providers.completion?.resolveOptionIntrinsic(ref.intrinsic)`. Return `undefined` if provider absent.

### 3. `policy-runtime.ts` — factory helper for completion context

Add `createCompletionContextProvider(request: ChoicePendingRequest, optionValue: MoveParamValue)` that builds the `CompletionContextProvider`:
- `type` → `request.type` ('chooseOne' or 'chooseN')
- `name` → `request.name`
- `targetKind` → first of `request.targetKinds`, or `'unknown'`
- `optionCount` → `request.options.length`
- `value` → `optionValue`

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify)

## Out of Scope

- Wiring the completion context into the evaluator (ticket 007)
- Changes to `createPolicyRuntimeProviders` input shape for existing use cases
- New ref kinds beyond `decisionIntrinsic` and `optionIntrinsic`
- YAML shorthand compilation (`{ ref: decision.type }` → compiled form) — that's in ticket 006

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `resolveDecisionIntrinsic('type')` returns `'chooseOne'` when provider is built from a chooseOne request
2. New unit test: `resolveDecisionIntrinsic('targetKind')` returns `'zone'` when request has `targetKinds: ['zone']`
3. New unit test: `resolveDecisionIntrinsic('optionCount')` returns the count of options in the request
4. New unit test: `resolveOptionIntrinsic('value')` returns the current option value
5. New unit test: when `completion` provider is absent, `decisionIntrinsic` and `optionIntrinsic` refs resolve to `undefined`
6. Existing suite: `pnpm -F @ludoforge/engine test` — all pass

### Invariants

1. Existing reference resolution (seat, turn, candidate, surface) is untouched — no new code paths for existing ref kinds.
2. `completion` sub-provider is optional — all existing `createPolicyRuntimeProviders` call sites work without changes.
3. Foundation #5 (Determinism): resolution is a pure function of the request and option value.
4. Foundation #1 (Engine Agnosticism): ref resolution maps to generic `ChoicePendingRequest` fields only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-runtime-completion.test.ts` — all resolution tests above

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "completion.*intrinsic"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck` (full suite)
