# 87UNIVIAPIP-004: Reassess and close discoveryCache threading ticket

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No new engine changes expected; verification and archival only unless reassessment finds a real gap
**Deps**: archive/tickets/87UNIVIAPIP/87UNIVIAPIP-002.md, archive/tickets/87UNIVIAPIP-003.md

## Problem

This ticket was written as if the classification-side discovery-cache threading had not yet been implemented. That assumption is stale.

The current repo already threads the cache through the classification pipeline:

- `enumerateRawLegalMoves` returns `discoveryCache`
- `enumerateLegalMoves` passes that cache to `classifyEnumeratedMoves`
- `classifyEnumeratedMoves` passes that cache to `probeMoveViability`
- `probeMoveViability` passes that cache to `resolveMoveDecisionSequence`

The real work left for this ticket is to correct the stale plan, confirm the architecture is still the right one, verify the relevant tests and quality gates, and archive the ticket with an accurate outcome.

## Assumption Reassessment (2026-03-27)

1. `move-decision-sequence.ts` already exports `DiscoveryCache` and already accepts `discoveryCache` in `ResolveMoveDecisionSequenceOptions`.
2. `apply-move.ts` already imports `DiscoveryCache`, `probeMoveViability` already accepts an optional `discoveryCache` parameter, and it already forwards that cache into `resolveMoveDecisionSequence`.
3. `legal-moves.ts` already threads `discoveryCache` from `enumerateRawLegalMoves` to `enumerateLegalMoves`, then into `classifyEnumeratedMoves`, then into `probeMoveViability`.
4. `RawLegalMoveEnumerationResult` already includes `discoveryCache`; the ticket must not claim that return-shape extension is still pending.
5. Dedicated tests already exist for this wiring:
   - `packages/engine/test/unit/kernel/apply-move.test.ts`
   - `packages/engine/test/unit/kernel/legal-moves.test.ts`
   - `packages/engine/test/integration/classified-move-parity.test.ts`
6. `archive/tickets/87UNIVIAPIP-003.md` already captured most of the implementation that this ticket originally proposed. The old 004 scope duplicated work that has already landed.

## Architecture Check

1. The current architecture is better than the stale ticket plan because it keeps the cache as a per-enumeration parallel data structure instead of attaching anything to `Move` or other hot-path runtime objects.
2. Threading the cache explicitly through `enumerateLegalMoves` -> `classifyEnumeratedMoves` -> `probeMoveViability` is still the right tradeoff here. It is simple, testable, and preserves the existing boundary between enumeration-time discovery and resolve-time probing.
3. The current design is preferable to any backwards-compatible aliasing or shim layer. The optional parameter on `probeMoveViability` is sufficient and does not justify introducing a second abstraction.
4. The main architectural risk is ticket drift, not code structure. Ticket 004 became stale after 003 landed broader-than-planned wiring. The correction here is to align the ticket with the actual codebase truth.

## Architectural Note

If this area needs a future cleanup, the next step would be an internal session object that owns enumeration budgets, warning emission, and discovery caching together. That may make sense if more cross-stage state is threaded later.

It is not justified by the current code. The existing explicit parameter threading is cleaner than introducing a premature session abstraction just to avoid one extra argument.

## Updated Scope

1. Verify the current implementation already satisfies Spec 87's cache-threading intent.
2. Verify the existing test coverage is sufficient for the invariant this ticket cares about.
3. Run the relevant engine tests plus typecheck and lint.
4. Mark this ticket completed and archive it with an accurate outcome section.

## Files Expected To Change

- `tickets/87UNIVIAPIP-004.md` (modify) — correct assumptions and scope before closure
- `archive/tickets/87UNIVIAPIP/87UNIVIAPIP-004.md` (move/archive) — final completed record with outcome

## Out of Scope

- New kernel behavior changes unless reassessment discovers an actual bug
- Reworking `move-decision-sequence.ts` into a session abstraction
- Any hot-path object shape changes (`Move`, `MoveEnumerationState`, `ClassifiedMove`, `EffectCursor`, `ReadContext`, `GameDefRuntime`)
- Agent-completion caching
- Backwards-compatibility aliases, shims, or dual paths

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/kernel/apply-move.test.ts` passes, including the direct `discoveryCache` probe coverage and the architecture guard for `probeMoveViability`.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` passes, including the root-state cached-discoverer/classification threading guard.
3. `packages/engine/test/integration/classified-move-parity.test.ts` passes unchanged.
4. `pnpm turbo typecheck` passes.
5. `pnpm turbo lint` passes.

### Invariants

1. `probeMoveViability` still executes the full validation pipeline; the cache only removes redundant discovery work inside `resolveMoveDecisionSequence`.
2. The cache remains internal to enumeration/classification and is not exposed in the external `enumerateLegalMoves` result shape.
3. No new fields are added to hot-path runtime objects.
4. The current architecture remains explicit and alias-free: one cache type, one resolve-time option field, one probe parameter.

## Test Plan

### Existing Tests To Rely On

1. `packages/engine/test/unit/kernel/apply-move.test.ts`
2. `packages/engine/test/unit/kernel/legal-moves.test.ts`
3. `packages/engine/test/integration/classified-move-parity.test.ts`

### Commands

1. `pnpm -F @ludoforge/engine test -- test/unit/kernel/apply-move.test.ts`
2. `pnpm -F @ludoforge/engine test -- test/unit/kernel/legal-moves.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/integration/classified-move-parity.test.ts`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-27
- Actual changes vs originally planned:
  - Corrected the ticket to match the current codebase instead of repeating already-landed implementation work.
  - Confirmed that the cache threading originally proposed here is already present in `move-decision-sequence.ts`, `legal-moves.ts`, and `apply-move.ts`.
  - Confirmed that the coverage originally described as future work already exists in the engine unit/integration suite.
- Architectural conclusion:
  - The current architecture is preferable to the stale ticket plan. A per-enumeration `DiscoveryCache` threaded explicitly through classification is clean, robust, and extensible enough for the present scope.
  - No backwards-compatibility aliasing or shim was added, and none is warranted.
  - A session-object refactor is possible future cleanup, but it is not justified by the current complexity.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- test/unit/kernel/apply-move.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- test/unit/kernel/legal-moves.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- test/integration/classified-move-parity.test.ts` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
