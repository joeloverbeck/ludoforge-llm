# 93COMMOVPOLEVA-002: Add trustedMoveIndex to input interfaces and wire preview lookup

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts`, `policy-eval.ts`, `policy-runtime.ts`
**Deps**: `archive/tickets/93COMMOVPOLEVA-001.md`

## Problem

The preview system re-probes every candidate via `classifyPlayableMoveCandidate` even when the move has already been completed by `preparePlayableMoves`. For completed moves, this re-probe fails to recognize pre-resolved inner decisions, causing all non-pass FITL moves to be classified as `rejected: notDecisionComplete`. The preview surface returns `unknown` for every candidate.

This ticket adds the `trustedMoveIndex` plumbing: a `ReadonlyMap<string, TrustedExecutableMove>` threaded through the input interfaces so the preview runtime can bypass re-probing for pre-completed moves. It also wires `getPreviewOutcome` to check the index before falling back to `classifyPlayableMoveCandidate`.

## Assumption Reassessment (2026-03-29)

1. `CreatePolicyPreviewRuntimeInput` currently has fields: `def`, `state`, `playerId`, `seatId`, `runtime?`, `dependencies?`. Confirmed.
2. `EvaluatePolicyMoveInput` currently has fields: `def`, `state`, `playerId`, `legalMoves`, `rng`, `runtime?`, `fallbackOnError?`, `profileIdOverride?`. Confirmed.
3. `CreatePolicyRuntimeProvidersInput` currently has fields: `def`, `state`, `playerId`, `seatId`, `catalog`, `runtime?`, `runtimeError`. Confirmed.
4. `tryApplyPreview` will exist as a local function in policy-preview.ts after 93COMMOVPOLEVA-001.
5. Test callsite counts: `policy-eval.test.ts` ~10, `policy-determinism.test.ts` ~4, `policy-visibility.test.ts` ~3, `policy-trace-events.test.ts` ~2, `policy-preview.test.ts` ~6. All need `trustedMoveIndex` added.

## Architecture Check

1. **Why index-injection**: The alternative (adding `trustedMove?` to `PolicyPreviewCandidate` and `PolicyRuntimeCandidate`) threads through the entire candidate pipeline. Index-injection adds the map once at construction — candidate types are untouched. The lookup key is `stableMoveKey`, already the caching key.
2. **Required, not optional**: Per F9 (no backwards-compatibility shims), `trustedMoveIndex` is a required field. All callers — production and test — are updated. Tests that don't exercise preview pass `new Map()`.
3. **Agnosticism (F1)**: All changes are in `packages/engine/src/agents/` — the kernel is untouched.
4. **Immutability (F7)**: The index is `ReadonlyMap`. `tryApplyPreview` returns new state objects.

## What to Change

### 1. Add `trustedMoveIndex` to `CreatePolicyPreviewRuntimeInput`

```typescript
export interface CreatePolicyPreviewRuntimeInput {
  // ... existing fields ...
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
}
```

### 2. Add `sourceStateHash` guard to `tryApplyPreview`

In `policy-preview.ts`, add a state-hash check at the top of `tryApplyPreview`:

```typescript
function tryApplyPreview(trustedMove: TrustedExecutableMove): PreviewOutcome {
  if (trustedMove.sourceStateHash !== input.state.stateHash) {
    return { kind: 'unknown', reason: 'failed' };
  }
  // ... existing apply logic from 93COMMOVPOLEVA-001 ...
}
```

### 3. Wire `getPreviewOutcome` to check trusted index first

```typescript
function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
  const cached = cache.get(candidate.stableMoveKey);
  if (cached !== undefined) return cached;

  const trusted = input.trustedMoveIndex.get(candidate.stableMoveKey);
  const outcome = trusted !== undefined
    ? tryApplyPreview(trusted)
    : classifyPreviewOutcome(
        deps.classifyPlayableMoveCandidate(input.def, input.state, candidate.move, input.runtime),
      );

  cache.set(candidate.stableMoveKey, outcome);
  return outcome;
}
```

### 4. Add `trustedMoveIndex` to `EvaluatePolicyMoveInput`

```typescript
export interface EvaluatePolicyMoveInput {
  // ... existing fields ...
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
}
```

Forward to `createPolicyRuntimeProviders` in `evaluatePolicyMove`/`evaluatePolicyMoveCore`.

### 5. Add `trustedMoveIndex` to `CreatePolicyRuntimeProvidersInput`

```typescript
export interface CreatePolicyRuntimeProvidersInput {
  // ... existing fields ...
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
}
```

Forward to `createPolicyPreviewRuntime` in `createPolicyRuntimeProviders`.

### 6. Update all existing test callsites

Every call to `evaluatePolicyMove`, `evaluatePolicyMoveCore`, `createPolicyPreviewRuntime`, or `createPolicyRuntimeProviders` in existing tests must add `trustedMoveIndex: new Map()`. This is a mechanical update — no behavioral change to existing tests.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — add field to input, wire getPreviewOutcome, add sourceStateHash guard)
- `packages/engine/src/agents/policy-eval.ts` (modify — add field to input, forward to runtime providers)
- `packages/engine/src/agents/policy-runtime.ts` (modify — add field to input, forward to preview runtime)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify — add `trustedMoveIndex: new Map()` to ~6 callsites)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify — add `trustedMoveIndex: new Map()` to ~10 callsites)
- `packages/engine/test/unit/property/policy-determinism.test.ts` (modify — add `trustedMoveIndex: new Map()` to ~4 callsites)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify — add `trustedMoveIndex: new Map()` to ~3 callsites)
- `packages/engine/test/unit/trace/policy-trace-events.test.ts` (modify — add `trustedMoveIndex: new Map()` to ~2 callsites)

## Out of Scope

- Building the `trustedMoveIndex` map in `PolicyAgent.chooseMove` (that's 93COMMOVPOLEVA-003)
- New tests for the trusted fast-path (that's 93COMMOVPOLEVA-004)
- Integration tests with FITL (that's 93COMMOVPOLEVA-005)
- Any changes to kernel code (`kernel/`, `cnl/`, `sim/`)
- Any changes to `PolicyPreviewCandidate`, `PolicyRuntimeCandidate`, or `CandidateEntry` types
- Golden fixture updates (those change when 93COMMOVPOLEVA-003 wires production usage)

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests in `test/unit/agents/policy-preview.test.ts` pass (with `new Map()` added)
2. All existing tests in `test/unit/agents/policy-eval.test.ts` pass (with `new Map()` added)
3. All existing property tests pass (determinism, visibility — with `new Map()` added)
4. All existing trace tests pass (with `new Map()` added)
5. Full suite: `pnpm turbo test`
6. TypeScript compiles: `pnpm turbo typecheck`

### Invariants

1. Existing test behavior is identical — empty maps mean no trusted index lookups fire
2. `PolicyPreviewCandidate`, `PolicyRuntimeCandidate`, and `CandidateEntry` types are unchanged
3. No kernel source files modified
4. No new exports besides the type addition to existing interfaces
5. Determinism (F5): empty index = identical code path as before
6. No backwards-compatibility shims (F9): field is required, not optional

## Test Plan

### New/Modified Tests

1. `test/unit/agents/policy-preview.test.ts` — mechanical: add `trustedMoveIndex: new Map()` to all `createPolicyPreviewRuntime` calls
2. `test/unit/agents/policy-eval.test.ts` — mechanical: add `trustedMoveIndex: new Map()` to all `evaluatePolicyMove`/`evaluatePolicyMoveCore` calls
3. `test/unit/property/policy-determinism.test.ts` — mechanical: add field to all callsites
4. `test/unit/property/policy-visibility.test.ts` — mechanical: add field to all callsites
5. `test/unit/trace/policy-trace-events.test.ts` — mechanical: add field to all callsites

### Commands

1. `pnpm -F @ludoforge/engine test` (targeted)
2. `pnpm turbo test` (full suite)
3. `pnpm turbo typecheck` (type safety)
4. `pnpm turbo lint` (style)
