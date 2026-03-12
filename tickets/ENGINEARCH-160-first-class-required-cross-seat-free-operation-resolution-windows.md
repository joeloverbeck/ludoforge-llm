# ENGINEARCH-160: First-Class Required Cross-Seat Free-Operation Resolution Windows

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — card-driven turn flow, event execution, free-operation issuance/consumption, and legality/runtime invariant handling
**Deps**: `tickets/README.md`, `archive/tickets/ENG-215-align-sequence-context-linkage-with-runtime-issuance-scopes.md`, `archive/tickets/ENGINEARCH-151-unify-free-operation-overlap-discovery-and-apply-contracts.md`, `packages/engine/src/kernel/effects-turn-flow.ts`, `packages/engine/src/kernel/event-execution.ts`, `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`

## Problem

The engine does not have a clean generic runtime contract for "another seat must now immediately resolve this required free operation, then turn flow resumes deterministically." Today, `grantFreeOperation` can append a pending grant, but a target-bound cross-seat grant with `completionPolicy: required` can stall card-driven auto-advance instead of opening a dedicated resolution window and resuming cleanly after the granted seat finishes. That forces game-data workarounds for rules-faithful events.

## Assumption Reassessment (2026-03-12)

1. `applyGrantFreeOperation(...)` in `packages/engine/src/kernel/effects-turn-flow.ts` appends pending grants generically, but it does not establish a first-class runtime window that temporarily hands control to a non-active seat for required resolution.
2. `legalMoves(...)` and turn-flow eligibility currently derive free-operation availability from the active-seat runtime state, which is why pending grants already work well for same-seat or optional follow-ups but are fragile when the required executor is another seat and the enclosing card flow wants immediate completion before advancing.
3. Current Lam Son 719 authoring in `data/games/fire-in-the-lake/41-events/065-096.md` avoids `completionPolicy: required` specifically because the intended contract stalls. Corrected scope: fix the generic runtime model rather than preserving author-side fallbacks.
4. Existing integration coverage in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` exercises grant issuance and consumption broadly, but does not yet pin the exact required cross-seat target-bound handoff/resume contract that Lam Son 719 needs.

## Architecture Check

1. The clean solution is to model required free-operation resolution as an explicit card-driven runtime window with deterministic ownership, executor, and resume semantics. That is more robust than relying on incidental active-seat state plus auto-advance heuristics.
2. This belongs entirely in the game-agnostic kernel/runtime layer. `GameSpecDoc` should declare that a grant is required and who executes it; the runtime should interpret that declaration generically without FITL or card-specific branching.
3. No backwards-compatibility shim should preserve the current ambiguous behavior. Once the new window exists, required cross-seat grants should have one canonical execution path.

## What to Change

### 1. Introduce an explicit required free-operation resolution window

Add a first-class card-driven runtime state or substate that represents "required grant resolution in progress" with enough data to:
- identify the pending grant(s) that are currently mandatory
- identify the decision seat and execution seat
- suspend enclosing card-flow auto-advance until the required window resolves
- resume turn flow deterministically after required resolution completes or is proven impossible by generic runtime rules

### 2. Unify issuance, seat handoff, and resume semantics

Refactor event/effect issuance and turn-flow eligibility so a required cross-seat grant does not piggyback on the original active seat's normal card window. The runtime should hand control to the grant-resolving seat through one generic mechanism, then restore the enclosing card-driven flow according to the grant's post-resolution contract.

### 3. Make required-resolution invariants explicit

Define and enforce generic invariants for:
- when the enclosing event/card may advance
- when the active seat may differ from the enclosing card's originating seat
- how required grants interact with sequence batches, overlap resolution, and pending-grant queues
- what runtime error or denial surface is used if a supposedly required window cannot be entered or resumed

### 4. Add regression coverage for immediate cross-seat follow-ups

Cover effect-issued and metadata-issued required grants where:
- the grant executor is another seat
- the grant is target-bound
- the card must not auto-advance until the required free operation resolves
- post-resolution turn flow resumes correctly without duplicate advancement or stall loops

## Files to Touch

- `packages/engine/src/kernel/types.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify if grant resolution window changes authorization ownership)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` (modify after the generic window exists)

## Out of Scope

- FITL-only event logic or any card-specific branching in engine code
- Visual-config changes or presentation behavior
- Reworking Lam Son 719 data before the generic runtime contract is available

## Acceptance Criteria

### Tests That Must Pass

1. A required free-operation grant issued to another seat opens a deterministic resolution window instead of stalling card-driven turn flow.
2. A target-bound required free-operation grant can be resolved by the granted seat and then resumes the enclosing card flow exactly once.
3. Required cross-seat grants behave consistently whether issued from side metadata or effect AST.
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. Existing suite: `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
6. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Required free-operation handoff/resume semantics are represented by one game-agnostic runtime contract.
2. Card/event advancement cannot bypass a required grant window or advance twice after required grant resolution.
3. No FITL/card identifiers or title-specific branches are introduced in runtime or legality logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — assert the granted seat receives the legal move surface during a required resolution window and the original card flow does not surface unrelated moves.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — assert required cross-seat grants consume, hand off, and resume without stall loops or duplicate advancement.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add end-to-end metadata/effect-issued regressions for target-bound required cross-seat grants.
4. `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` — update to assert immediate required ARVN LimOp handoff once the generic window exists.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. `node --test packages/engine/dist/test/integration/fitl-events-lam-son-719.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm run check:ticket-deps`
