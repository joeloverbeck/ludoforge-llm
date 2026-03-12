# ENG-227: Constrained event grant viability preflight

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — free-operation viability analysis, turn-flow event gating, and regression coverage
**Deps**: archive/tickets/ENG-205-authoritative-event-grant-viability-legality.md, archive/tickets/ENGINEARCH-084-free-op-sequence-viability-diagnostics.md, packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/kernel/free-operation-viability.ts, packages/engine/src/kernel/free-operation-preflight-overlay.ts, packages/engine/src/kernel/legal-moves-turn-order.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/test/integration/fitl-event-free-operation-grants.test.ts

## Problem

`requireUsableForEventPlay` currently rejects or suppresses event sides using a coarse free-operation viability probe that is sound for simple grants but not for constrained deferred grants whose usability depends on exact move witnesses, dynamic zone bindings, and sequence-context capture. Card-71 `An Loc` exposed the gap: the shaded event executes correctly at runtime with a constrained free NVA March into exactly one City followed by two Attacks there, but event-play preflight could not certify that March grant as usable, so the card had to drop the `requireUsableForEventPlay` gate. That leaves event legality over-permissive in some states and blocks fully declarative card authoring.

## Assumption Reassessment (2026-03-12)

1. Current event-play legality still flows through shared generic turn-flow filtering in `packages/engine/src/kernel/legal-moves-turn-order.ts` and `packages/engine/src/kernel/turn-flow-eligibility.ts`; the gap is not missing authoritative enforcement, it is insufficient preflight expressiveness.
2. `packages/engine/src/kernel/free-operation-viability.ts` already recognizes `requireUsableForEventPlay`, but the current viability analysis does not prove constrained deferred grant usability when legality depends on exact move payloads, dynamic zone-filter bindings, and sequence-context capture.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` already covers simpler `requireUsableForEventPlay` cases, but does not lock the harder class of grants where a valid witness move must both satisfy the free operation and establish downstream sequence context.
4. `packages/engine/test/integration/fitl-events-an-loc.test.ts` currently verifies the runtime path after removing the gating workaround. That confirms the runtime free-op machinery is stronger than the event-play preflight surface for this class of card.

## Architecture Check

1. The clean fix is a stronger generic viability engine that reasons from the same canonical grant/action legality surfaces as actual runtime execution, rather than card-specific exceptions or weaker authoring conventions.
2. `GameSpecDoc` should remain the place where a game encodes a constrained March or Attack. `GameDef`, simulator, and kernel should only provide reusable machinery for proving whether a declaratively-authored constrained grant is currently usable.
3. No backwards-compatibility shim is desired. Replace the coarse preflight behavior with one canonical witness-based analysis path and update callers/tests accordingly.

## What to Change

### 1. Introduce witness-based free-operation viability analysis

Replace the current yes/no preflight heuristic with a generic analysis that can prove a grant usable by finding at least one legal witness move under the grant's real constraints:

1. same action/profile surface as runtime execution,
2. same `executeAsSeat` and seat-resolution rules,
3. same move-zone binding and probe-binding rules,
4. same zone-filter evaluation rules,
5. same sequence-step and sequence-context requirements,
6. same outcome/completion policy requirements relevant to event-play gating.

The viability result should be derived from canonical move legality, not from special-case card logic or action-specific heuristics.

### 2. Unify event-play gating with the stronger analysis

Update event-side gating so `requireUsableForEventPlay` relies on the new witness-based analysis. Event suppression and direct `applyMove` rejection must stay aligned through the shared generic path.

### 3. Support constrained deferred-sequence proofs

The analysis must be able to certify grants like:

1. one constrained free March that must move a specific piece class into exactly one eligible target zone,
2. a later grant whose legal domain is narrowed by sequence-context captured from the March,
3. outcome-required grants where a legal move must also produce a non-noop state change.

The new contract should prove the first grant usable without needing game-specific knowledge of FITL March or Attack.

### 4. Add regression coverage for the hard class of grants

Expand the generic free-operation/event-play suite with a minimal synthetic constrained-sequence case and then pin the real FITL `An Loc` scenario once the engine support exists.

## Files to Touch

- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/free-operation-preflight-overlay.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` (modify if the current probe surface cannot carry witness-grade bindings)
- `packages/engine/src/kernel/free-operation-sequence-progression.ts` (modify if sequence-context witness capture must be exposed generically)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-viability.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` (modify if contracts/surfaces change)

## Out of Scope

- Card-71 data rewrites in this ticket.
- FITL-specific engine branches keyed on `An Loc`, `March`, `Attack`, `City`, or faction IDs.
- Visual config changes.

## Acceptance Criteria

### Tests That Must Pass

1. `requireUsableForEventPlay` suppresses an event side when no witness move exists for a constrained deferred grant.
2. `requireUsableForEventPlay` keeps an event side playable when at least one witness move exists for a constrained deferred grant using dynamic zone bindings and sequence context.
3. Discovery and direct `applyMove` rejection remain aligned for the same constrained-grant state.
4. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Event-play viability remains game-agnostic and derived from canonical generic grant legality, not game IDs or card IDs.
2. `GameSpecDoc` continues to author the constraint; the engine only proves present-tense usability of that authored constraint.
3. There is one canonical event-play viability path, with no fallback heuristic kept for older behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-viability.test.ts` — add witness-based viability cases for constrained grants with dynamic zone filters and required outcomes.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a constrained deferred-sequence regression that proves event-play gating can certify a legal first-step grant which also establishes downstream sequence context.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — keep parity assertions between discovery suppression and direct `applyMove` rejection for the constrained case.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-viability.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
