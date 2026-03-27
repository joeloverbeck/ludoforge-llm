# 87UNIVIAPIP-001: Add DiscoveryCache type and discoverer override to classifyMoveDecisionSequenceSatisfiability

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/move-decision-sequence.ts
**Deps**: None (first in sequence)

## Problem

`classifyMoveDecisionSequenceSatisfiability` constructs its own `legalChoicesDiscover` wrapper internally (line 191-198). There is no way for callers to inject a cached or custom discoverer. This prevents the enumeration pipeline from sharing discovery results with the classification pipeline.

## Assumption Reassessment (2026-03-27)

1. `classifyMoveDecisionSequenceSatisfiability` (move-decision-sequence.ts:184) constructs an inline discoverer that calls `legalChoicesDiscover` — confirmed at lines 191-198.
2. `classifyDecisionSequenceSatisfiability` (decision-sequence-satisfiability.ts:107) accepts a `DecisionSequenceChoiceDiscoverer` as its second argument — confirmed.
3. `DecisionSequenceChoiceDiscoverer` type is already exported from `decision-sequence-satisfiability.ts:27` — confirmed.
4. Three callers use `classifyMoveDecisionSequenceSatisfiability`: `isMoveDecisionSequenceSatisfiable` (line 147), `classifyMoveDecisionSequenceAdmissionForLegalMove` (line 159), and `isMoveDecisionSequenceAdmittedForLegalMove` (line 175 via classifyMoveDecisionSequenceAdmissionForLegalMove) — confirmed.

## Architecture Check

1. Adding an optional `discoverer` override to the options bag is the minimal, non-breaking change that enables injection without altering the default behavior.
2. The change is kernel-internal, game-agnostic, and does not touch compiler or runtime boundaries.
3. No backwards-compatibility shims — existing callers that omit `discoverer` get identical behavior.

## What to Change

### 1. Add `DiscoveryCache` type alias

In `move-decision-sequence.ts`, add the exported type:

```typescript
import type { ChoiceRequest, Move } from './types.js';

export type DiscoveryCache = Map<Move, ChoiceRequest>;
```

This is a simple type alias. The Map is keyed by Move **object reference** (not serialized key). This works because enumeration and classification iterate the same Move object references (Array.prototype.filter preserves references).

### 2. Add optional `discoverer` to `classifyMoveDecisionSequenceSatisfiability`

Extend the options parameter:

```typescript
export const classifyMoveDecisionSequenceSatisfiability = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: Omit<ResolveMoveDecisionSequenceOptions, 'choose'> & {
    readonly discoverer?: DecisionSequenceChoiceDiscoverer;
  },
  runtime?: GameDefRuntime,
): MoveDecisionSequenceSatisfiabilityResult => {
  const discover: DecisionSequenceChoiceDiscoverer = options?.discoverer ?? ((move, discoverOptions) =>
    legalChoicesDiscover(def, state, move, {
      ...(discoverOptions?.onDeferredPredicatesEvaluated === undefined
        ? {}
        : { onDeferredPredicatesEvaluated: discoverOptions.onDeferredPredicatesEvaluated }),
    }, runtime));
  return classifyDecisionSequenceSatisfiability(baseMove, discover, {
    ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
    ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
  });
};
```

### 3. Propagate discoverer through wrapper functions

`classifyMoveDecisionSequenceAdmissionForLegalMove` and `isMoveDecisionSequenceAdmittedForLegalMove` must forward the discoverer option so enumeration callers in `legal-moves.ts` can pass it through.

Add the same optional `discoverer` field to their options parameter types and forward to `classifyMoveDecisionSequenceSatisfiability`.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify) — add `DiscoveryCache` type, add `discoverer` option to `classifyMoveDecisionSequenceSatisfiability` and its wrapper functions

## Out of Scope

- `legal-moves.ts` — callers are NOT updated in this ticket (that's 87UNIVIAPIP-003)
- `apply-move.ts` — `probeMoveViability` is NOT changed here (that's 87UNIVIAPIP-004)
- `ResolveMoveDecisionSequenceOptions` — the `discoveryCache` field for `resolveMoveDecisionSequence` is NOT added here (that's 87UNIVIAPIP-002)
- `decision-sequence-satisfiability.ts` — no changes to this file
- Any hot-path object shapes (Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, GameDefRuntime)

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests in `packages/engine/test/unit/kernel/` that exercise `classifyMoveDecisionSequenceSatisfiability`, `isMoveDecisionSequenceAdmittedForLegalMove`, or `classifyMoveDecisionSequenceAdmissionForLegalMove` pass unchanged.
2. `pnpm turbo test` passes with no regressions.
3. `pnpm turbo typecheck` passes (new optional parameter is type-safe).

### Invariants

1. When `discoverer` is omitted, behavior is identical to current code (default discoverer calls `legalChoicesDiscover` with same arguments).
2. No new fields on Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, or GameDefRuntime.
3. `DiscoveryCache` type is exported for use by downstream tickets.
4. `DecisionSequenceChoiceDiscoverer` import is re-used from `decision-sequence-satisfiability.ts` — no duplicate type.

## Test Plan

### New/Modified Tests

1. No new tests required — this is a pure additive signature change with default fallback. Behavioral verification happens in 87UNIVIAPIP-005.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
