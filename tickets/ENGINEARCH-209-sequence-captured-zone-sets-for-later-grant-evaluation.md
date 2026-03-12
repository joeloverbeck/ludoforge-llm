# ENGINEARCH-209: Sequence-Captured Zone Sets for Later Grant Evaluation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — free-operation sequence context transport, generic evaluation surfaces, validation, and legality/apply parity
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/effects-turn-flow.ts`, `packages/engine/src/kernel/validate-events.ts`, `packages/engine/src/kernel/validate-effects.ts`, `packages/engine/src/kernel/types-turn-flow.ts`, `packages/engine/src/kernel/types-ast.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/unit/effects-turn-flow.test.ts`, `packages/engine/test/unit/validate-gamedef.test.ts`

## Problem

The engine already captures same-batch move-zone selections through `sequenceContext.captureMoveZoneCandidatesAs`, but later grants can only consume that information indirectly via `requireMoveZoneCandidatesFrom`. That is too narrow for exact authoring of chained free operations where the later grant must reason about the earlier selection set inside generic predicates or execution context.

The current limitation blocks exact authoring for patterns such as:
- Rally in authored spaces, then allow a later move only when selected pieces originate from that earlier space set.
- Chained grants whose later legality needs set membership against prior selected spaces rather than simple candidate-zone overlap.

## Assumption Reassessment (2026-03-12)

1. `packages/engine/src/kernel/turn-flow-eligibility.ts` persists captured move-zone sets per sequence batch in `freeOperationSequenceContexts.capturedMoveZonesByKey`, so the engine already owns the underlying runtime data.
2. `packages/engine/src/kernel/free-operation-grant-authorization.ts` currently lets later grants consume that data only through `requireMoveZoneCandidatesFrom`, which checks overlap between current move-zone candidates and the captured set. It does not expose the set as a generic value surface.
3. `packages/engine/src/kernel/event-execution.ts` plus deferred event effects already provide a clean sequencing mechanism (`effectTiming: afterGrants`) for staged grant issuance; the missing piece is not event sequencing itself but generic access to the captured zone set during later grant evaluation.
4. Existing runtime predicate infrastructure already supports dynamic membership sets in generic evaluation flows, so the corrected scope is to transport captured sequence-zone sets into those existing generic surfaces rather than inventing a Fire-in-the-Lake-specific authoring hook.

## Architecture Check

1. Exposing captured zone sets through a generic evaluation surface is cleaner than proliferating operation-specific free-operation flags or FITL-only grant helpers.
2. This preserves the boundary: `GameSpecDoc` authors describe how a later grant depends on a prior selected zone set, while `GameDef`, compiler, and kernel only transport and evaluate generic sequence-derived data.
3. No backwards-compatibility aliasing should be retained. Choose one canonical way for authored data to reference captured sequence-zone sets and apply it consistently across declarative and effect-issued grants.
4. The new surface must remain reusable for any game and any action family, not only FITL events.

## What to Change

### 1. Add a canonical runtime surface for captured sequence-zone sets

Extend the generic free-operation grant evaluation model so later grants can reference a captured sequence-zone set as data inside:
- `zoneFilter`
- `executionContext`
- other generic value/condition surfaces used by grant legality and application

The authored contract should reference the captured set by batch-local key, not by game-specific semantics.

### 2. Align validation and lowering with the new surface

Update event/effect validation so the new captured-set reference is:
- allowed only where the runtime can resolve it generically
- rejected when it points at a missing or invalid sequence key
- kept consistent between declarative event grants and effect-issued `grantFreeOperation`

### 3. Keep discovery, legal-move generation, and apply-time authorization aligned

Later grants that rely on captured sets must behave the same way in:
- event play viability
- `legalMoves`
- `legalChoicesDiscover` / denial analysis
- `applyMove`

Do not allow discovery to surface a free move that apply-time grant authorization later rejects because the captured-set surface was unavailable or inconsistently resolved.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/validate-events.ts` (modify)
- `packages/engine/src/kernel/validate-effects.ts` (modify)
- `packages/engine/src/contracts/binder-surface-contract.ts` (modify if the new surface needs contract exposure)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Re-encoding Fire in the Lake card data in this ticket.
- Adding game-specific operation classes, event hooks, or FITL-only runtime branches.
- Visual presentation or `visual-config.yaml` changes.

## Acceptance Criteria

### Tests That Must Pass

1. A later free-operation grant can reference a same-batch captured move-zone set through a canonical generic runtime surface, without using `requireMoveZoneCandidatesFrom` as the only consumer.
2. Declarative event grants and effect-issued `grantFreeOperation` validate and resolve the new captured-set surface identically.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Captured sequence-zone data is exposed through a generic engine contract, not through Fire in the Lake specific identifiers or branches.
2. `GameSpecDoc` remains the source of game-specific chained-operation logic; `GameDef`, compiler, kernel, and simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — prove later grants can consume captured zone sets through the new generic surface and that discovery/apply stay aligned.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — prove effect-issued grant emission preserves and resolves the new captured-set transport correctly.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — prove invalid/missing captured-set references fail validation deterministically.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
4. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm run check:ticket-deps`
