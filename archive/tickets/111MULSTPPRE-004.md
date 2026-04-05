# 111MULSTPPRE-004: Wire evaluator callback from policy-eval into preview

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent evaluation pipeline
**Deps**: `archive/tickets/111MULSTPPRE-003.md`, `archive/specs/111-multi-step-preview-for-granted-operations.md`

## Problem

The `evaluateGrantedOperation` callback added in ticket 002 and consumed in ticket 003 needs an actual implementation. This callback must enumerate legal moves in the post-event state, evaluate them using the agent's PolicyAgent profile, select the best via argmax, and return it. The implementation lives in `policy-eval.ts` which already has access to both the preview and evaluation pipelines.

## Assumption Reassessment (2026-04-05)

1. `policy-eval.ts` constructs preview dependencies and passes them to the preview system — confirmed (lines ~108-120).
2. `policy-eval.ts` has access to the agent profile, compiled considerations, and evaluation context — confirmed.
3. Legal move enumeration is available via kernel functions (`legalMoves`) importable from kernel index — confirmed.
4. The evaluation pipeline's scoring logic (evaluate candidates, compute scores, select argmax) is in `policy-evaluation-core.ts` — confirmed.

## Architecture Check

1. The callback is implemented in `policy-eval.ts` (the orchestration layer), not in `policy-preview.ts` (the simulation layer). This preserves the separation: preview simulates, eval evaluates, and the callback bridges them.
2. The callback implementation does NOT pass `evaluateGrantedOperation` to its OWN preview construction — this enforces the recursion depth cap of 1 (Foundation 10). The inner evaluation uses single-step preview only.
3. Engine-agnostic: the callback uses generic `legalMoves()`, the standard scoring pipeline, and `argmax` selection. No game-specific logic.

## What to Change

### 1. Implement `evaluateGrantedOperation` callback (`policy-eval.ts`)

Create a function that:
1. Calls `legalMoves(def, postEventState, runtime)` to enumerate available moves for the agent's seat
2. Filters to moves for the agent's seat ID
3. Runs the agent's scoring pipeline on these moves (same considerations, features, pruning as the main evaluation — but WITHOUT multi-step preview in the inner pass)
4. Selects the highest-scoring candidate via argmax
5. Returns `{ move, score }` or `undefined` if no legal moves

Key constraint: the inner evaluation MUST NOT inject `evaluateGrantedOperation` into its preview dependencies. This prevents recursion.

### 2. Inject callback when constructing preview dependencies

In the section of `policy-eval.ts` where `PolicyPreviewDependencies` is constructed (around lines 108-120), add:

```typescript
evaluateGrantedOperation: (def, postEventState, agentSeatId, runtime) => {
  // Implementation from step 1
},
```

### 3. Reuse the existing preview `seatId` input

Ticket 002 kept the existing `seatId` field instead of adding a duplicate `agentSeatId`. Ticket 004 should therefore use the existing preview/runtime seat identity already threaded through the evaluation context.

### 4. Return a `Move`; preview handles trust conversion

The callback continues to return a plain `Move`. Ticket 003 now classifies that move inside `policy-preview.ts` before applying it, so ticket 004 should focus on selecting the best granted-operation move and returning `{ move, score }`, not on constructing a `TrustedExecutableMove` itself.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — pass seat context)
- `packages/engine/test/agents/policy-eval-granted-op.test.ts` (new)

## Out of Scope

- Changes to `policy-preview.ts` (done in tickets 002-003)
- Diagnostic enrichment (ticket 005)
- Changes to agent profile YAML or DSL

## Acceptance Criteria

### Tests That Must Pass

1. Callback correctly enumerates legal moves in post-event state
2. Callback uses the agent's scoring profile (considerations, features, pruning) to select the best move
3. Callback does NOT use multi-step preview in its inner evaluation (recursion guard)
4. Callback returns `undefined` when no legal moves are available
5. The existing preview `seatId` is correctly passed through to the callback
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Inner evaluation does NOT inject `evaluateGrantedOperation` — recursion depth stays at 1
2. Callback is deterministic: same post-event state + same profile = same selected move
3. No new cross-module imports between `policy-preview.ts` and evaluation modules — callback is the bridge

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-eval-granted-op.test.ts` — callback implementation: legal move enumeration, profile-based scoring, no-legal-moves fallback, recursion guard verification

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/agents/policy-eval-granted-op.test.js`
2. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-04-05.

`policy-eval.ts` now injects a real `evaluateGrantedOperation` callback for preview. The callback enumerates legal moves in the post-event state, resolves the granted seat to the correct player, confirms the derived state's active seat still matches the granted seat, recursively evaluates the available moves through the normal policy scoring pipeline, and returns the best plain `Move` plus score. The recursive inner pass intentionally omits `evaluateGrantedOperation`, so multi-step preview stays capped at depth 1.

To make that callback reachable from the real preview path, the implementation also threaded optional preview dependencies through `packages/engine/src/agents/policy-evaluation-core.ts` and `packages/engine/src/agents/policy-runtime.ts`. No schema, DSL, or trace-surface changes were needed for this ticket.

Implementation notes:
- Reused the corrected contract from ticket 003: the callback still returns a plain `Move`, and `policy-preview.ts` still owns the `Move -> TrustedExecutableMove` trust conversion before applying the granted operation.
- The actual dependency-injection seam extended below `policy-eval.ts` into the provider/runtime factory layers, so adjacent contract files were updated even though the top-level ticket primarily named `policy-eval.ts`.
- Used a dedicated live unit test file at `packages/engine/test/unit/agents/policy-eval-granted-op.test.ts` rather than the stale path named in the ticket.
- The “no legal moves” proof was implemented as “no granted-operation moves available to the evaluating seat” so the derived post-event state remains previewable while still forcing the callback to return `undefined`.

Verification:
- `pnpm -F @ludoforge/engine build`
- `node packages/engine/dist/test/unit/agents/policy-eval-granted-op.test.js`
- `pnpm -F @ludoforge/engine test`
