# ENG-223: Resume Card Flow After Required Grant Resolution

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — card-driven turn-flow candidate restoration after required free-operation grant resolution
**Deps**: archive/tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/apply-move.ts

## Problem

ENG-203 introduced required pending free-operation grants that block pass/card-end, but the current runtime can remain pinned to the temporary required-grant candidate seats even after the obligation is satisfied. That breaks normal card progression and can expose regular actions to a seat that has already acted.

## Assumption Reassessment (2026-03-09)

1. Current required-grant enforcement rewrites `currentCard.firstEligible` / `secondEligible` to the ready required-grant seats during the obligation window.
2. Current free-operation consumption path does not rerun the ordinary post-move eligibility transition after a successful free operation; it only consumes the pending grant and updates grant runtime state.
3. Mismatch: once the last required pending grant resolves, the runtime should resume the card’s underlying acted/passed progression instead of preserving the temporary obligation candidates. Correction: restore normal candidates from authoritative card state when the obligation window closes.

## Architecture Check

1. The fix belongs in shared turn-flow runtime, not in per-card data or per-action special cases, because the bug is in generic obligation lifecycle state.
2. Restoring candidates from card runtime facts (`actedSeats`, `passedSeats`, `eligibility`, suspended card-end state) preserves the engine’s game-agnostic turn-flow model.
3. No compatibility shims or alias fields should be added; the ticket should repair the existing ENG-203 runtime semantics directly.

## What to Change

### 1. Restore underlying card candidates when required window closes

Update required-grant consumption/finalization so the runtime recomputes the card’s normal eligible seats from authoritative card state once no ready required pending grants remain. Do not reuse the temporary candidate override as the source of truth.

### 2. Preserve suspended card-end semantics during restoration

Ensure the same fix works when required grants were delaying a `rightmostPass` or `twoNonPass` card end. When the last blocking grant resolves, the engine should either finalize the suspended card end or resume the still-open card with correct candidates.

### 3. Add regression coverage for successful resolution

Add tests for the success path that ENG-203 missed: required free operation succeeds, pending grant clears, active seat advances correctly, and no regular action is exposed to a seat that already acted.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify if post-consumption turn-flow handoff needs adjustment)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Redesigning ENG-203 completion/outcome contract fields.
- Game-data migration work such as Ia Drang re-encoding.

## Acceptance Criteria

### Tests That Must Pass

1. After a required free operation succeeds, the current card resumes its normal eligible-seat progression instead of remaining pinned to the obligated seat.
2. If a required grant was suspending `rightmostPass` or `twoNonPass` card end, resolving the last blocking grant deterministically finalizes or resumes the card according to the existing turn-flow rules.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Required-grant candidate overrides are temporary derived state, not the long-lived source of truth for post-resolution turn-flow progression.
2. Card-driven progression after grant resolution remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — verify a successful required free op clears the grant and restores the correct active seat/current-card candidates.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — verify the seat that already acted does not receive regular non-free moves after the required window closes.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — verify end-to-end obligation resolution resumes normal card flow.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
