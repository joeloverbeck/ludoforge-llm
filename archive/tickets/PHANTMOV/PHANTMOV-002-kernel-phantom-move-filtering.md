# PHANTMOV-002: Lock deterministic free-operation template viability at legal-move enumeration

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — regression coverage in engine tests; runtime changes only if current kernel behavior disproves the reassessed assumptions
**Deps**: archive/tickets/PHANTMOV/PHANTMOV-001-simulator-defensive-catch.md

## Problem

The original ticket assumes `enumerateLegalMoves` still admits free-operation
template moves via a purely optimistic probe and therefore needs a new
post-enumeration completion filter. That assumption no longer matches the
codebase.

Current kernel behavior already contains deterministic, bounded existential
checks for free-operation templates during enumeration. The real risk is now
architectural drift: the ticket still proposes a weaker random retry filter and
anchors on a stale historical reproduction instead of the current contract.

This ticket should therefore validate and lock the current architecture rather
than replace it with a probabilistic layer.

## Assumption Reassessment (2026-03-29)

1. `enumerateLegalMoves` still classifies raw moves through
   `classifyEnumeratedMoves`, but pending free-operation grants are no longer
   admitted by a naive optimistic probe alone. Confirmed in
   `packages/engine/src/kernel/legal-moves.ts`.
2. `enumeratePendingFreeOperationMoves` already calls deterministic viability
   helpers such as `hasLegalCompletedFreeOperationMoveInCurrentState` and
   `canResolveAmbiguousFreeOperationOverlapInCurrentState` before surfacing a
   free-operation template. Confirmed.
3. `classifyEnumeratedMoves` still deliberately defers specific
   `zoneFilterMismatch` probe failures into `viable: true, complete: false`
   classified moves, so agents can complete genuinely viable templates without
   discarding them early. Confirmed.
4. `evaluatePlayableMoveCandidate` remains the agent-side completion path, but
   it is no longer the first place where viability is reconciled for pending
   free operations. The kernel already performs bounded existential admission
   checks earlier in the pipeline.
5. The historical FITL seed-1009 reproduction is not a trustworthy acceptance
   target anymore. Current FITL coverage should use a deterministic authored
   grant scenario instead of an unverified seed anecdote.

## Architecture Check

1. The original post-enumeration random completion filter is not architecturally
   better than the current design. It would introduce probabilistic
   classification where the kernel already has deterministic, bounded,
   game-agnostic existential viability helpers.
2. Replacing deterministic admission checks with "try K random completions"
   would weaken FOUNDATIONS.md #5 and #10. A move should be surfaced because
   the kernel can prove some legal completion exists within bounded search, not
   because a random sample happened to succeed.
3. The clean architecture is:
   - kernel enumeration owns truthfulness of surfaced legal moves;
   - agent preparation owns concrete completion of still-incomplete but
     existentially valid templates;
   - regression tests prove the boundary on a deterministic authored scenario.
4. The remaining work for this ticket is therefore to tighten the specification
   and coverage around the current deterministic contract, not to add another
   filtering layer.

## What to Change

### 1. Correct the ticket to match the current kernel

Document that pending free-operation enumeration already uses deterministic
existential viability checks, and explicitly reject the previously proposed
random post-filter architecture.

### 2. Add regression coverage for the current contract

Strengthen tests around a deterministic FITL authored scenario where one
free-operation batch is unusable and must be skipped while a later batch
remains legal. The tests should prove:

1. unusable free-operation templates are not surfaced by legal-move
   enumeration;
2. surfaced free-operation templates remain existentially completable according
   to the kernel's bounded viability helper;
3. the valid downstream grant is still preserved.

### 3. Only change runtime code if the tests disprove the reassessed model

If current behavior already satisfies the contract, do not add a new runtime
filter. Close the ticket with test/documentation changes only.

## Files to Touch

- `tickets/PHANTMOV-002-kernel-phantom-move-filtering.md`
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts`
- optionally a focused kernel test file only if the integration coverage proves insufficient

## Out of Scope

- Replacing deterministic kernel viability checks with probabilistic retry logic
- Broad agent-interface redesign
- General template-completion performance tuning

## Acceptance Criteria

### Tests That Must Pass

1. The deterministic authored FITL free-operation scenario proves that an
   unusable batch is skipped at legal-move enumeration time.
2. The same scenario proves the valid downstream free-operation template is
   still surfaced.
3. Surfaced free-operation templates in that scenario satisfy the kernel's
   bounded existential-viability helper.
4. Existing relevant engine tests pass, plus the full engine suite.

### Invariants

1. Determinism: legal-move admission remains deterministic and bounded
2. No probabilistic retry classification in kernel legality
3. No game-specific logic added to kernel
4. Authored free-operation skip behavior is proven by automated tests, not by
   historical seed anecdotes

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-sihanouk.test.ts` — strengthen
   the existing authored grant regression so it asserts the unusable VC batch is
   skipped and the surviving NVA free-operation template remains existentially
   completable.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Reassessed the ticket against the current kernel and rewrote it to match the
    existing deterministic free-operation viability architecture.
  - Rejected the originally proposed probabilistic post-enumeration retry filter
    as architecturally inferior to the current bounded existential viability
    helpers already used by legal-move enumeration.
  - Strengthened `packages/engine/test/integration/fitl-events-sihanouk.test.ts`
    so the authored skip-VC/NVA-follow-up scenario now proves both that unusable
    free-operation batches do not leak phantom moves into enumeration and that
    surfaced free-operation templates remain existentially completable.
  - Made no kernel runtime changes because the current architecture already
    satisfied the corrected ticket scope.
- Deviations from original plan:
  - Did not implement a new filter in `legal-moves.ts` or a random completion
    retry loop.
  - Did not use the stale FITL seed-1009 anecdote as acceptance criteria.
  - Closed the ticket with specification correction plus regression coverage,
    because that was the architecturally complete fix after reassessment.
- Verification results:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm run check:ticket-deps`
