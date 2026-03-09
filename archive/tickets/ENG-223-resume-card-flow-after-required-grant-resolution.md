# ENG-223: Resume Card Flow After Required Grant Resolution

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — card-driven turn-flow progression after required free-operation grant resolution
**Deps**: archive/tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/apply-move.ts

## Problem

ENG-203 introduced required pending free-operation grants that block pass/card-end, but the current runtime can remain pinned to the temporary required-grant candidate seats even after the obligation is satisfied. That breaks normal card progression and can expose regular actions to a seat that has already acted.

## Assumption Reassessment (2026-03-09)

1. Current required-grant enforcement rewrites `turnOrderState.runtime.currentCard.firstEligible` / `secondEligible` to the ready required-grant seats during the obligation window via `withRequiredGrantCandidates(...)` in `packages/engine/src/kernel/turn-flow-eligibility.ts`.
2. Current free-operation consumption is also handled in `packages/engine/src/kernel/turn-flow-eligibility.ts` by `consumeTurnFlowFreeOperationGrant(...)`; after a successful free operation it consumes the pending grant and sequence/deferred state, but it does not advance the card’s ordinary acted/passed/non-pass progression unless a suspended card end is already waiting.
3. Mismatch: once the last required pending grant resolves on an otherwise still-open card, the runtime should resume the card’s underlying progression from authoritative card facts (`actedSeats`, `passedSeats`, `nonPassCount`, `eligibility`) instead of preserving the temporary obligation candidates.
4. Existing tests already cover required-grant blocking and failure-path legality. The missing regression coverage is the successful-resolution path that should hand control back to the next normal eligible seat or finalize a suspended card end.

## Architecture Check

1. The fix belongs in shared turn-flow runtime, not in per-card data, legal-move filtering, or per-action special cases, because the bug is in generic obligation lifecycle state.
2. The clean architectural direction is to derive visible card candidates from canonical runtime facts after every grant lifecycle transition. Temporary required-grant overrides should never become the durable source of truth once the obligation window closes.
3. No compatibility shims or alias fields should be added; the ticket should repair the existing ENG-203 runtime semantics directly.

## What to Change

### 1. Resume normal card progression when required window closes

Update required-grant consumption/finalization so the runtime recomputes the current card’s normal progression from authoritative card state once no ready required pending grants remain. Do not reuse the temporary candidate override as the source of truth.

### 2. Preserve suspended card-end semantics during restoration

Ensure the same fix works when required grants were delaying a `rightmostPass` or `twoNonPass` card end. When the last blocking grant resolves, the engine should either finalize the suspended card end or resume the still-open card with correct candidates.

### 3. Add regression coverage for successful resolution

Add tests for the success path that ENG-203 missed: required free operation succeeds, pending grant clears, `currentCard` progression reflects the executed move, the next normal seat becomes active when the card stays open, and no regular action is exposed to a seat that already acted.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (touch only if dispatch/trace plumbing must change; avoid if not needed)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify if legality surface needs explicit regression after success-path restoration)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Redesigning ENG-203 completion/outcome contract fields.
- Game-data migration work such as Ia Drang re-encoding.

## Acceptance Criteria

### Tests That Must Pass

1. After a required free operation succeeds on an open card, the current card resumes its normal eligible-seat progression instead of remaining pinned to the obligated seat.
2. If a required grant was suspending `rightmostPass` or `twoNonPass` card end, resolving the last blocking grant deterministically finalizes or resumes the card according to the existing turn-flow rules.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Required-grant candidate overrides are temporary derived state, not the long-lived source of truth for post-resolution turn-flow progression.
2. Free-operation consumption must preserve the same canonical card-state progression invariants as ordinary action resolution.
3. Card-driven progression after grant resolution remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — verify a successful required free op clears the grant, records the acting seat in card state, and restores the correct active seat/current-card candidates.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — verify the seat that already acted does not regain regular non-free moves after the required window closes.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — verify end-to-end obligation resolution resumes normal card flow after a successful required free operation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- What actually changed:
  - Required free-operation grant consumption now rejoins the canonical post-move turn-flow transition after grant bookkeeping, so successful required grants update `currentCard`, active seat selection, and card-end handling from authoritative runtime state.
  - Optional free-operation grants keep their prior out-of-band semantics; only `completionPolicy: required` grants re-enter ordinary turn-flow progression.
  - Required grants now declare that re-entry explicitly via `postResolutionTurnFlow: resumeCardFlow` instead of relying on implicit `completionPolicy` inference, and compiler/runtime/schema layers enforce that contract.
  - Added regression coverage for the open-card resume path, legality surface after required-grant resolution, and an end-to-end required-grant integration flow.
  - Updated stale runtime-reason taxonomy coverage so the full engine suite reflects the exported `FREE_OPERATION_OUTCOME_POLICY_FAILED` reason.
  - Regenerated engine schema artifacts so the public JSON schemas match the refined free-operation grant contract.
- Deviations from original plan:
  - `packages/engine/src/kernel/apply-move.ts` needed a real dispatch change so required free operations could route through canonical turn-flow progression after grant consumption.
  - `packages/engine/test/unit/kernel/runtime-reasons.test.ts` also needed an update because full-suite verification exposed unrelated stale reason-registry expectations.
  - The ticket originally stopped at runtime repair, but the final implementation also split the ambiguous contract axis by making required-grant turn-flow re-entry explicit.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
