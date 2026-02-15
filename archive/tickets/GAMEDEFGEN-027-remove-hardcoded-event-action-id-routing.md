# GAMEDEFGEN-027: Remove Hardcoded Event Action Id Routing

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 0) Reassessed assumptions (updated against current code/tests)

1. Runtime event routing is currently hardcoded by literal action id checks in multiple paths, not only move discovery/choice resolution:
   - `src/kernel/legal-moves.ts`
   - `src/kernel/legal-choices.ts`
   - `src/kernel/event-execution.ts`
2. Compiler currently reserves action id `"event"` when `eventDecks` are declared and synthesizes that action id if missing:
   - `src/cnl/compiler-core.ts`
3. Existing tests currently encode the reserved-id assumption (`"event"` is compiler-owned under `eventDecks`).
4. Broader card-driven turn-flow action-class semantics still depend on class labels (`pass|event|operation|...`) and are currently inferred from move/action identifiers in separate code paths. That broader architecture is adjacent but not the direct target of this ticket.

## 1) What must be added/fixed

1. Introduce explicit generic action capability metadata on actions in compiled `GameDef` (not game-specific engine branching), with one capability used for event-card routing.
2. Remove hardcoded literal `'event'` action-id checks from event-card routing paths (`legal-moves`, `legal-choices`, `event-execution`) and route by capability metadata.
3. Update compiler behavior for `eventDecks`:
   - stop treating action id `"event"` as reserved/compiler-owned;
   - synthesize an event-capable action only when needed;
   - fail deterministically on malformed/ambiguous event capability declarations.
4. Keep kernel/compiler contracts game-agnostic and reusable (no FITL/game-specific identifiers).

## 1.1) Scope boundary

In scope:
1. Event-card behavior routing and compiler synthesis/validation for event-capable actions.
2. Tests that currently rely on id `"event"` reservation and event-card routing by action id.

Out of scope for this ticket:
1. Full redesign of turn-flow action-class modeling (`pass|event|operation|...`) beyond event-card capability routing.

## 2) Invariants that must pass

1. Event routing behavior remains deterministic and equivalent for existing event decks.
2. Event-card behavior is not keyed to a reserved literal action id.
3. Non-event actions named `event` do not receive event-card behavior unless explicitly declared event-capable.
4. Engine modules remain game-agnostic and free of game-specific string special cases.

## 3) Tests that must pass

1. Unit: event-capability routing tests for event-capable and non-capable actions, including misleading action ids.
2. Unit: compiler tests no longer enforce reserved id `"event"`; they validate capability-driven synthesis/ambiguity diagnostics.
3. Integration: event decision-side/branch flows continue to work with capability-based routing.
4. Integration: determinism/card-flow suites pass with capability-based event routing.
5. Regression: compile/validate diagnostics catch missing/invalid/ambiguous event capability declarations under `eventDecks`.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added generic action capability metadata (`actions[].capabilities`) to GameSpecDoc validation, lowering, and core ActionDef schema/type contracts.
  - Added kernel capability helpers and switched event-card routing in `legal-moves`, `legal-choices`, and `event-execution` from literal action id checks to capability-based routing.
  - Replaced compiler reserved-id behavior with capability-driven event-action synthesis/validation:
    - no reserved literal `"event"` requirement;
    - synthesize a `cardEvent`-capable action when none exists under `eventDecks`;
    - deterministic error when multiple `cardEvent`-capable actions are declared.
  - Updated and expanded unit/integration tests for capability routing and compiler diagnostics.
- Deviations from original plan:
  - Ticket scope was explicitly clarified to exclude full turn-flow action-class architecture redesign; this implementation targets event-card routing and compiler contracts only.
  - A separate integration expectation (`pipelineAtomicCostValidationFailed`) was updated to reflect current runtime behavior surfaced during full-suite verification.
- Verification:
  - `npm test` passed.
  - `npm run lint` passed.
