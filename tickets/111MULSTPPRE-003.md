# 111MULSTPPRE-003: Implement multi-step preview in tryApplyPreview

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent preview logic
**Deps**: `archive/tickets/111MULSTPPRE-002.md`, `specs/111-multi-step-preview-for-granted-operations.md`

## Problem

The core preview function `tryApplyPreview()` simulates one move and evaluates the resulting state. For event candidates that grant free operations to the agent, it must additionally simulate the granted operation as a second step, producing a combined state that reflects "event + best follow-up action."

## Assumption Reassessment (2026-04-05)

1. `tryApplyPreview()` at `policy-preview.ts:266` applies a move and returns a `PreviewOutcome` — confirmed.
2. `candidate.move.params` contains `eventCardId` and `side` for event moves — confirmed via `legal-moves.ts:1105-1118`.
3. `def.cardAnnotationIndex?.entries[cardId]?.[side]` provides `grantsOperation` (boolean) and `grantOperationSeats` (readonly string[]) — confirmed via `types-core.ts:528-529`.
4. `grantOperationSeats` can contain `"self"` or literal seat IDs — confirmed via `compile-event-annotations.ts:350-378`.

## Architecture Check

1. Multi-step logic is contained entirely within `tryApplyPreview()` — no changes to the preview's external API or return type.
2. Engine-agnostic: uses compiled annotations (generic) and the injected callback (generic). No game-specific branching.
3. Recursion depth capped at 1 by not passing the `evaluateGrantedOperation` callback to the inner evaluation — Foundation 10 (Bounded Computation).
4. Deterministic: same event + same state + same callback = same result — Foundation 8.

## What to Change

### 1. Detect granted operations after event preview (`policy-preview.ts`)

After `tryApplyPreview()` produces a successful `PreviewOutcome` (kind `ready` or `stochastic`), check if the candidate is an operation-granting event:

```typescript
const cardId = trustedMove.move.params.eventCardId;
const side = trustedMove.move.params.side;
if (typeof cardId === 'string' && typeof side === 'string') {
  const annotation = input.def.cardAnnotationIndex?.entries[cardId]?.[side];
  if (annotation?.grantsOperation && deps.evaluateGrantedOperation) {
    // Check if agent's seat is among grantees
    const agentSeat = input.agentSeatId;
    const seats = annotation.grantOperationSeats;
    const isGrantee = seats.includes(agentSeat) || seats.includes('self');
    if (isGrantee) {
      // Simulate granted operation...
    }
  }
}
```

### 2. Simulate granted operation

When the agent is a grantee:
- Call `deps.evaluateGrantedOperation(input.def, previewState, agentSeat, input.runtime)`
- If it returns a move, apply it: `deps.applyMove(input.def, previewState, grantedTrustedMove, undefined, input.runtime)`
- Use the resulting state instead of `previewState` for the final `PreviewOutcome`
- Record the granted operation details for trace enrichment (ticket 005)

### 3. Handle edge cases

- **Callback returns undefined**: fall back to post-event-only state (no change)
- **applyMove throws**: catch, log, fall back to post-event-only state
- **Opponent-only grantees**: skip multi-step (agent is not a grantee)
- **Recursion depth**: the `evaluateGrantedOperation` callback MUST be implemented without recursive multi-step preview (enforced in ticket 004 by not injecting the callback into the inner evaluation)

### 4. Store granted operation metadata on the PreviewOutcome

Extend the internal `PreviewOutcome` type (local to policy-preview.ts) to carry optional granted operation metadata:

```typescript
grantedOperation?: {
  move: Move;
  score: number;
  preEventMargin?: number;
  postEventPlusOpMargin?: number;
};
```

This metadata flows through to diagnostic enrichment (ticket 005).

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/test/agents/policy-preview-granted-op.test.ts` (modify — add tests)

## Out of Scope

- Implementing the actual `evaluateGrantedOperation` callback (ticket 004)
- Diagnostic trace wiring (ticket 005)
- Changes to `policy-eval.ts` or `policy-evaluation-core.ts`

## Acceptance Criteria

### Tests That Must Pass

1. Multi-step preview activates for event candidates where `grantsOperation === true` and agent is a grantee
2. Non-granting events produce identical preview scores (regression)
3. Opponent-granting events (grantees don't include agent seat) do NOT trigger multi-step
4. Recursion depth capped at 1 — if callback somehow triggers preview, it stops
5. Callback returning undefined → graceful fallback to post-event-only state
6. `grantOperationSeats` containing `"self"` resolves correctly to agent seat
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Preview behavior is IDENTICAL for non-event candidates (zero regression surface)
2. Preview behavior is IDENTICAL when `evaluateGrantedOperation` callback is not provided
3. Multi-step depth never exceeds 1 (Foundation 10)
4. Same inputs always produce same output (Foundation 8)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-preview-granted-op.test.ts` — extend with: activation test, non-granting regression, opponent-only skip, self-seat resolution, callback-undefined fallback, depth cap

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/agents/policy-preview-granted-op.test.js`
2. `pnpm -F @ludoforge/engine test`
