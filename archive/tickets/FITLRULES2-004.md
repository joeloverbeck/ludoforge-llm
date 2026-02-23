# FITLRULES2-004: Pivotal Event Turn-Flow Wiring (Rule 2.3.8)

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium  
**Engine Changes**: Data + tests (no kernel behavior change expected)  
**Deps**: FITLRULES2-003 (completed; monsoon restrictions are already wired)

## Reassessed Assumptions (2026-02-23)

1. Production FITL still lacks `turnFlow.pivotal` in `data/games/fire-in-the-lake/30-rules-actions.md`.
2. Kernel/compiler pivotal support already exists and is well-covered in generic tests:
   - `packages/engine/src/kernel/legal-moves-turn-order.ts`
   - `packages/engine/src/cnl/compile-turn-flow.ts`
   - `packages/engine/test/unit/legal-moves.test.ts`
   - `packages/engine/test/unit/compile-top-level.test.ts`
3. The old proposal’s cancellation rule was incorrect for current semantics:
   - `winner: { eventCardTagsAny: [pivotal] }` and `canceled: { eventCardTagsAny: [pivotal] }` would self-cancel all matching pivotal moves.
4. Adding 4 duplicated faction-specific pivotal actions is not the cleanest architecture for this engine.
   - It duplicates action definitions and weakens reuse of existing event-card parameterization.
   - A single pivotal action with card-id parameter and declarative seat/card ownership constraints is cleaner and more extensible.
5. Pivotal cards 121-124 already exist with `tags: [pivotal, <faction>]` and `playCondition` in `data/games/fire-in-the-lake/41-content-event-decks.md`.

## Problem

Rule 2.3.8 pivotal windows and trump precedence are not wired in production FITL turn flow.  
This leaves pivotal behavior unexpressed in production data despite existing engine support.

## Architecture Rationale

The updated design is more robust than the prior proposal:

- Use one generic `pivotalEvent` action instead of 4 duplicated stubs.
- Keep trumping logic in `turnFlow.pivotal.interrupt.precedence` where it belongs.
- Keep ownership/selection constraints declarative in YAML action preconditions.
- Avoid cancellation rules unless selectors can be made non-self-canceling and necessary.

This aligns with Agnostic Engine + DRY principles and reduces long-term maintenance cost.

## Updated Scope

### 1) Production turn-flow wiring (`data/games/fire-in-the-lake/30-rules-actions.md`)

Add:

```yaml
turnFlow:
  actionClassByActionId:
    pivotalEvent: event
  pivotal:
    actionIds: [pivotalEvent]
    requirePreActionWindow: true
    disallowWhenLookaheadIsCoup: true
    interrupt:
      precedence: ['3', '1', '2', '0']
```

No cancellation block in this ticket.

### 2) Production action wiring (`data/games/fire-in-the-lake/30-rules-actions.md`)

Add a single pivotal action:

- `id: pivotalEvent`
- mapped as event class
- `eventCardId` param constrained to pivotal card IDs (`card-121`..`card-124`)
- precondition that only allows each seat to submit its own pivotal card ID:
  - seat `0` -> `card-121`
  - seat `2` -> `card-122`
  - seat `1` -> `card-123`
  - seat `3` -> `card-124`

This ticket only wires turn-flow/action availability and ownership constraints.
Card-specific pivotal effects remain separate scope.

## Invariants

1. Compiled production `GameDef` includes `turnFlow.pivotal.actionIds = ['pivotalEvent']`.
2. `turnFlow.pivotal.requirePreActionWindow === true`.
3. `turnFlow.pivotal.disallowWhenLookaheadIsCoup === true`.
4. `turnFlow.pivotal.interrupt.precedence === ['3', '1', '2', '0']`.
5. `pivotalEvent` compiles and is mapped to action class `event`.
6. `pivotalEvent` enforces seat/card ownership mapping via precondition.
7. Pivotal moves are unavailable once pre-action window closes.
8. In monsoon (lookahead coup), pivotal moves are unavailable without override token.

## Tests

1. **Production compile invariant test**: assert pivotal turn-flow block and `pivotalEvent` action wiring.
2. **Integration runtime test (production-compiled def)**: pivotal available only in pre-action window and blocked after first non-pass action.
3. **Integration runtime test (production-compiled def)**: precedence ordering enforces VC > ARVN > NVA > US among first/second eligible contenders.
4. **Regression**: existing FITL turn-flow/monsoon/event integration tests continue to pass.

## Outcome

- **Completion date**: 2026-02-23
- **What changed (actual)**:
  - Added production FITL `turnFlow.pivotal` wiring in `data/games/fire-in-the-lake/30-rules-actions.md` with:
    - `actionIds: [pivotalEvent]`
    - `requirePreActionWindow: true`
    - `disallowWhenLookaheadIsCoup: true`
    - `interrupt.precedence: ['3', '1', '2', '0']`
  - Added `actionClassByActionId.pivotalEvent: event`.
  - Added a single `pivotalEvent` action with `eventCardId` enum `[card-121, card-122, card-123, card-124]` and seat-to-card ownership precondition mapping.
  - Expanded production compile assertions in `packages/engine/test/integration/fitl-production-data-compilation.test.ts`.
  - Added runtime integration coverage in `packages/engine/test/integration/fitl-production-pivotal-turn-flow.test.ts` for pre-action window gating and precedence ordering.
- **Deviation from original plan**:
  - Replaced the original 4-action-stub design with one generic pivotal action to reduce duplication and avoid brittle cancellation wiring.
  - Dropped the original cancellation selector proposal because it would self-cancel all pivotal moves under current kernel semantics.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed: `256` tests, `0` failed.
  - `pnpm -F @ludoforge/engine lint` passed.
