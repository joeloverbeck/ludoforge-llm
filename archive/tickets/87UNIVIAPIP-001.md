# 87UNIVIAPIP-001: Add DiscoveryCache type and explicit classification options to move-decision-sequence helpers

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/move-decision-sequence.ts
**Deps**: None (first in sequence)

## Problem

`classifyMoveDecisionSequenceSatisfiability` constructs its own `legalChoicesDiscover` wrapper internally. There is no way for callers to inject a cached or custom discoverer. This prevents the enumeration pipeline from sharing discovery results with the classification pipeline.

## Assumption Reassessment (2026-03-27)

1. `classifyMoveDecisionSequenceSatisfiability` in `packages/engine/src/kernel/move-decision-sequence.ts` constructs an inline discoverer that delegates to `legalChoicesDiscover` on every call site that uses the default path.
2. `classifyDecisionSequenceSatisfiability` in `packages/engine/src/kernel/decision-sequence-satisfiability.ts` already accepts a `DecisionSequenceChoiceDiscoverer` as its second argument, so no lower-layer redesign is required.
3. `ResolveMoveDecisionSequenceOptions` currently models only resolve-time concerns (`choose`, `budgets`, `onWarning`). It does not model classification-only concerns and should not become the dumping ground for them.
4. The wrapper stack is `isMoveDecisionSequenceSatisfiable` -> `classifyMoveDecisionSequenceSatisfiability`, plus the legal-move admission pair `classifyMoveDecisionSequenceAdmissionForLegalMove` / `isMoveDecisionSequenceAdmittedForLegalMove`.
5. The repo already has focused tests for these helpers in `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` plus an export-surface guard in `packages/engine/test/unit/kernel/move-decision-sequence-export-surface-guard.test.ts`. This ticket should strengthen those tests instead of deferring all behavioral verification.

## Architecture Check

1. Adding an injectable discoverer is still the right direction, but threading it through `Omit<ResolveMoveDecisionSequenceOptions, 'choose'>` is the wrong abstraction. Classification helpers should use an explicit options type that models classification concerns directly.
2. `DiscoveryCache` remains a useful shared type alias because later tickets need one canonical cache type across enumeration and classification.
3. The change is kernel-internal, game-agnostic, and does not touch compiler or runtime boundaries.
4. No backwards-compatibility shims or aliases. If helper signatures change, all internal callers and tests should be updated in the same change.

## What to Change

### 1. Add `DiscoveryCache` type alias

In `move-decision-sequence.ts`, add the exported type:

```typescript
import type { ChoiceRequest, Move } from './types.js';

export type DiscoveryCache = Map<Move, ChoiceRequest>;
```

This is a simple type alias. The Map is keyed by Move **object reference** (not serialized key). This works because enumeration and classification iterate the same Move object references (Array.prototype.filter preserves references).

### 2. Add explicit classification options type

In `move-decision-sequence.ts`, add an exported options interface for the classification helpers instead of reusing `ResolveMoveDecisionSequenceOptions` via `Omit`:

```typescript
export interface MoveDecisionSequenceSatisfiabilityOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly discoverer?: DecisionSequenceChoiceDiscoverer;
}
```

This keeps `resolveMoveDecisionSequence` and the classification helpers cleanly separated.

### 3. Add optional `discoverer` to `classifyMoveDecisionSequenceSatisfiability`

Extend the options parameter:

```typescript
export const classifyMoveDecisionSequenceSatisfiability = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: MoveDecisionSequenceSatisfiabilityOptions,
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

### 4. Propagate discoverer through wrapper functions

`classifyMoveDecisionSequenceAdmissionForLegalMove` and `isMoveDecisionSequenceAdmittedForLegalMove` must forward the discoverer option so enumeration callers in `legal-moves.ts` can pass it through.

Also change `isMoveDecisionSequenceSatisfiable` to accept the same explicit `MoveDecisionSequenceSatisfiabilityOptions` type so the helper family shares one coherent contract.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify) — add `DiscoveryCache` type, add `MoveDecisionSequenceSatisfiabilityOptions`, add `discoverer` option to `classifyMoveDecisionSequenceSatisfiability` and its wrapper functions
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify) — add focused coverage for injected discoverers and default fallback behavior
- `packages/engine/test/unit/kernel/move-decision-sequence-export-surface-guard.test.ts` (modify) — update export contract if new canonical types are exported

## Out of Scope

- `legal-moves.ts` — callers are NOT updated in this ticket (that's 87UNIVIAPIP-003)
- `apply-move.ts` — `probeMoveViability` is NOT changed here (that's 87UNIVIAPIP-004)
- `ResolveMoveDecisionSequenceOptions` — do not add `discoverer` here; resolve-time and classification-time options stay separate. The `discoveryCache` field for `resolveMoveDecisionSequence` is handled in 87UNIVIAPIP-002.
- `decision-sequence-satisfiability.ts` — no changes to this file
- Any hot-path object shapes (Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, GameDefRuntime)

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests in `packages/engine/test/unit/kernel/` that exercise `classifyMoveDecisionSequenceSatisfiability`, `isMoveDecisionSequenceAdmittedForLegalMove`, or `classifyMoveDecisionSequenceAdmissionForLegalMove` pass unchanged.
2. `pnpm turbo test` passes with no regressions.
3. `pnpm turbo typecheck` passes (new optional parameter is type-safe).

### Invariants

1. When `discoverer` is omitted, behavior is identical to current code (default discoverer calls `legalChoicesDiscover` with same arguments).
2. `ResolveMoveDecisionSequenceOptions` remains focused on resolve-time behavior and does not gain classification-only fields.
3. No new fields on Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, or GameDefRuntime.
4. `DiscoveryCache` type is exported for use by downstream tickets.
5. `DecisionSequenceChoiceDiscoverer` import is re-used from `decision-sequence-satisfiability.ts` — no duplicate type.

## Test Plan

### New/Modified Tests

1. Add a unit test proving `classifyMoveDecisionSequenceSatisfiability` uses an injected discoverer instead of the default `legalChoicesDiscover` path.
2. Add a unit test proving the admission wrappers forward the injected discoverer and preserve existing classification semantics.
3. Keep the export-surface guard aligned with the new canonical types.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-27
- Actual change:
  Added `DiscoveryCache` and a dedicated `MoveDecisionSequenceSatisfiabilityOptions` contract in `move-decision-sequence.ts`, then threaded the new classification options through `isMoveDecisionSequenceSatisfiable`, `classifyMoveDecisionSequenceAdmissionForLegalMove`, `isMoveDecisionSequenceAdmittedForLegalMove`, and `classifyMoveDecisionSequenceSatisfiability`.
- Deviations from original plan:
  The original ticket proposed reusing `Omit<ResolveMoveDecisionSequenceOptions, 'choose'>`. That was rejected in favor of a dedicated classification-options type so resolve-time and classification-time concerns stay separate.
  The original ticket deferred tests. This implementation added focused unit coverage now because the new discoverer injection is an architectural contract, not just incidental plumbing.
- Verification:
  `pnpm -F @ludoforge/engine build`
  `pnpm -F @ludoforge/engine lint`
  `pnpm -F @ludoforge/engine typecheck`
  `pnpm -F @ludoforge/engine test:unit`
  `pnpm turbo typecheck`
  `pnpm turbo lint`
  `pnpm turbo test`
