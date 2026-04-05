# 111MULSTPPRE-002: Add evaluateGrantedOperation callback to PolicyPreviewDependencies

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent preview interface
**Deps**: `archive/tickets/111MULSTPPRE-001.md`, `specs/111-multi-step-preview-for-granted-operations.md`

## Problem

The preview module (`policy-preview.ts`) needs to call the agent evaluation pipeline to select the best granted operation, but it currently has no dependency on evaluation logic. A callback must be added to `PolicyPreviewDependencies` following the existing dependency injection pattern (same pattern as `applyMove`, `classifyPlayableMoveCandidate`, `derivePlayerObservation`).

## Assumption Reassessment (2026-04-05)

1. `PolicyPreviewDependencies` is defined at `policy-preview.ts:33` — confirmed.
2. Existing callbacks: `classifyPlayableMoveCandidate`, `applyMove`, `derivePlayerObservation` — all optional, confirmed at lines 34-54.
3. Default no-op satisfiers are at lines 108-120 — confirmed.
4. `Move`, `GameDef`, `GameState`, `GameDefRuntime` types are importable from kernel — confirmed.

## Architecture Check

1. Follows the existing dependency injection pattern exactly — `PolicyPreviewDependencies` already has 3 optional callbacks. Adding a 4th is consistent.
2. The callback signature is engine-agnostic: it takes generic `GameDef`, `GameState`, seat ID, and returns a `Move` + score. No game-specific types.
3. The preview module stays decoupled — it calls the callback without importing evaluation modules. The caller (`policy-eval.ts`) provides the implementation.

## What to Change

### 1. Add callback type to `PolicyPreviewDependencies` (`policy-preview.ts`)

Add after the existing `derivePlayerObservation` callback:

```typescript
readonly evaluateGrantedOperation?: (
  def: GameDef,
  postEventState: GameState,
  agentSeatId: string,
  runtime?: GameDefRuntime,
) => { move: Move; score: number } | undefined;
```

### 2. Add `agentSeatId` to `PolicyPreviewInput`

The preview needs to know the agent's seat to check `grantOperationSeats`. Add to the input interface (around line 55-60):

```typescript
readonly agentSeatId?: string;
```

### 3. Update default no-op satisfier

In the `satisfies Required<PolicyPreviewDependencies>` blocks (lines ~108-120), add a default that returns `undefined` (no granted operation simulation):

```typescript
evaluateGrantedOperation: () => undefined,
```

### 4. Unit test: callback is optional and defaults to no-op

Write a test confirming that constructing preview without `evaluateGrantedOperation` works identically to before — no behavioral change.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/test/agents/policy-preview-granted-op.test.ts` (new)

## Out of Scope

- No multi-step preview logic (ticket 003)
- No callback implementation (ticket 004)
- No changes to `policy-eval.ts` or `policy-evaluation-core.ts`

## Acceptance Criteria

### Tests That Must Pass

1. New test: constructing preview without callback produces identical behavior to baseline
2. New test: callback type is correctly exposed on `PolicyPreviewDependencies`
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Preview behavior is IDENTICAL when callback is not provided — pure additive interface change
2. No new imports from evaluation modules in `policy-preview.ts`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-preview-granted-op.test.ts` — verify callback is optional and default no-op preserves existing behavior

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/agents/policy-preview-granted-op.test.js`
2. `pnpm -F @ludoforge/engine test`
