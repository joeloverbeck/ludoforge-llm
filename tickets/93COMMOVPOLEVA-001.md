# 93COMMOVPOLEVA-001: Extract tryApplyPreview from classifyPreviewOutcome

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts`
**Deps**: None

## Problem

The `classifyPreviewOutcome` function in `policy-preview.ts` combines two responsibilities: (1) classifying whether a move is `playableComplete`, and (2) applying the move to produce a preview state. Ticket 93COMMOVPOLEVA-002 needs to call the apply-and-observe logic from a different code path (the trusted index fast-path). Extracting the application logic into a standalone `tryApplyPreview` function enables reuse without duplication.

## Assumption Reassessment (2026-03-29)

1. `classifyPreviewOutcome` exists in `policy-preview.ts` and is a local (non-exported) function inside the `createPolicyPreviewRuntime` closure. Confirmed via exploration.
2. The function calls `deps.applyMove`, checks RNG equality via a local `rngStatesEqual` comparison, and calls `deps.derivePlayerObservation`. These are injected dependencies on the `PolicyPreviewDependencies` interface.
3. No other callers of `classifyPreviewOutcome` exist outside the module — it's only called from `getPreviewOutcome` inside the same closure.

## Architecture Check

1. **Why this approach**: Pure extraction refactor. The new `tryApplyPreview` is a local function inside the same closure — no new exports, no interface changes. This is the minimal change that enables 93COMMOVPOLEVA-002 to reuse the apply logic.
2. **Agnosticism**: No game-specific logic. The function operates on `TrustedExecutableMove` and `GameDef`/`GameState` — fully generic.
3. **No shims**: No backwards-compatibility concerns — this is an internal refactor with identical behavior.

## What to Change

### 1. Extract `tryApplyPreview` inside `createPolicyPreviewRuntime`

Inside the `createPolicyPreviewRuntime` function body, extract a new local function:

```typescript
function tryApplyPreview(trustedMove: TrustedExecutableMove): PreviewOutcome {
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

### 2. Reduce `classifyPreviewOutcome` to a thin wrapper

```typescript
function classifyPreviewOutcome(classification: PlayableCandidateClassification): PreviewOutcome {
  return classification.kind !== 'playableComplete'
    ? { kind: 'unknown', reason: mapClassificationReason(classification) }
    : tryApplyPreview(classification.move);
}
```

The existing reason-mapping logic (`random`, `hidden`, `unresolved`, `failed`) is preserved — only the `playableComplete` branch delegates to `tryApplyPreview`.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)

## Out of Scope

- Adding `trustedMoveIndex` to any interface (that's 93COMMOVPOLEVA-002)
- Modifying `getPreviewOutcome` behavior (that's 93COMMOVPOLEVA-002)
- Any changes to kernel code
- Any changes to test files (this is a pure refactor — existing tests must pass unchanged)
- Any changes to `policy-eval.ts`, `policy-runtime.ts`, or `policy-agent.ts`

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests in `test/unit/agents/policy-preview.test.ts` pass unchanged
2. All existing tests in `test/unit/agents/policy-eval.test.ts` pass unchanged
3. Full suite: `pnpm turbo test`

### Invariants

1. `classifyPreviewOutcome` produces identical `PreviewOutcome` values for all inputs — bit-identical behavior before and after the refactor
2. No new exports from `policy-preview.ts` — `tryApplyPreview` is local to the closure
3. No interface changes to `CreatePolicyPreviewRuntimeInput` or `PolicyPreviewRuntime`
4. Determinism (F5): unchanged — same function logic, just reorganized
5. Engine agnosticism (F1): no kernel files touched

## Test Plan

### New/Modified Tests

None — this is a pure refactor. Existing tests are the verification.

### Commands

1. `pnpm -F @ludoforge/engine test` (targeted)
2. `pnpm turbo test` (full suite)
3. `pnpm turbo typecheck` (type safety)
4. `pnpm turbo lint` (style)
