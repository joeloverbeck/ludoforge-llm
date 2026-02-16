# ARCHTRACE-003: Add Generic Resource Transfer Trace Primitive

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new game-agnostic trace primitive
**Deps**: ARCHTRACE-002

## What Needs To Change / Be Implemented

Introduce a first-class `resourceTransfer` trace entry so game logic does not need to reconstruct transfers from paired var deltas.

Required implementation:
1. Define new trace entry type/schema for `resourceTransfer` with generic fields:
- `from`: `{ scope, var, player? }`
- `to`: `{ scope, var, player? }`
- `requestedAmount`
- `actualAmount`
- optional clamp metadata (e.g., source floor / destination cap / explicit min/max)
- provenance metadata from ARCHTRACE-002
2. Emit `resourceTransfer` from `commitResource` effect execution.
3. Preserve existing `varChange` trace entries for backward internal diagnostics unless intentionally replaced.
4. Update schema artifacts.

## Invariants That Should Pass

1. Every successful `commitResource` with `actualAmount > 0` emits exactly one `resourceTransfer` trace entry.
2. `resourceTransfer.actualAmount` must equal net source decrease and destination increase for the same effect.
3. `actualAmount` is never negative.
4. Transfer tracing remains generic for any game/resource, not poker-specific.

## Tests That Should Pass

1. Unit test: `commitResource` emits `resourceTransfer` with correct endpoints and amounts.
2. Unit test: clamped transfers report expected `requestedAmount` vs `actualAmount`.
3. Unit test: no-op transfers (`actualAmount == 0`) follow explicitly defined policy (emit or skip) consistently.
4. Integration test: Texas showdown/refund assertions can use `resourceTransfer` instead of inferred var-delta pairing.
5. Schema sync test and full regression suite pass.
