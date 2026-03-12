# FITLEVECARENC-026: Card-71 An Loc full-fidelity rework

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None in this ticket beyond depending on ENG-227
**Deps**: tickets/ENG-227-constrained-event-grant-viability-preflight.md, data/games/fire-in-the-lake/41-events/065-096.md, packages/engine/test/integration/fitl-events-an-loc.test.ts

## Problem

Card-71 `An Loc` is currently runtime-correct but not fully encoded in its intended declarative form. The shaded side had to remove `requireUsableForEventPlay` from the constrained NVA March grant because the engine could not certify that grant as usable during event-play preflight. The result is a working runtime path with a known authoring compromise: event gating can be broader than the true rules-legal event availability. This ticket removes that compromise once ENG-227 lands.

## Assumption Reassessment (2026-03-12)

1. `data/games/fire-in-the-lake/41-events/065-096.md` currently contains the authored `An Loc` implementation and the shaded side already uses a constrained free March plus a same-city double Attack sequence.
2. `packages/engine/test/integration/fitl-events-an-loc.test.ts` already covers the runtime details that matter for rules fidelity: South Vietnam includes LoCs, the March is free and Monsoon-legal, only Troops may satisfy the March requirement, and both Attacks stay bound to the marched-into City.
3. The remaining gap is not FITL runtime behavior. It is that the card is not yet using the intended `requireUsableForEventPlay` gate on the constrained shaded grant because current engine preflight cannot prove that grant usable.
4. Once ENG-227 lands, the preferred `An Loc` shape is to restore the viability gate in card data and lock the exact gating behavior with card-specific regression tests.

## Architecture Check

1. This ticket keeps all FITL-specific card semantics in FITL event data and FITL tests. It must not introduce any `An Loc`-specific runtime branching.
2. Depending on ENG-227 is cleaner than inventing card-local workarounds or duplicating March/Attack legality inside the card's target predicates.
3. No backwards-compatibility preservation is needed for the workaround encoding. The final card should use the single canonical viability contract.

## What to Change

### 1. Re-enable canonical event-play gating on shaded

Restore `viabilityPolicy: requireUsableForEventPlay` on the constrained shaded March grant once ENG-227 makes that gate sound for this class of card.

### 2. Keep the card fully declarative

Do not add bespoke FITL runtime hooks. If the card still needs extra authoring after ENG-227, that authoring must remain purely declarative inside FITL event data and must not duplicate engine logic already provided generically.

### 3. Expand `An Loc` regression coverage to lock the restored contract

Add tests that prove:

1. shaded event is available only when there is a real legal troop March into exactly one City that satisfies the grant,
2. shaded event is suppressed when no such March witness exists,
3. after play, runtime behavior remains the same as the current fully-tested sequence.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/test/integration/fitl-events-an-loc.test.ts` (modify)

## Out of Scope

- Generic engine changes covered by ENG-227.
- Reworking unrelated FITL event cards.
- Visual config changes.

## Acceptance Criteria

### Tests That Must Pass

1. Card-71 shaded again uses `viabilityPolicy: requireUsableForEventPlay` on its constrained March grant.
2. Card-71 shaded event is not legal to play when no legal troop-into-City March witness exists.
3. Card-71 shaded event remains legal to play when such a witness exists, including Monsoon-legal free March behavior.
4. Card-71 runtime sequence still enforces same-city double Attack after the March.
5. Existing suite: `node --test packages/engine/dist/test/integration/fitl-events-an-loc.test.js`

### Invariants

1. FITL card behavior remains encoded in FITL `GameSpecDoc` data and tests, not in engine branches.
2. Card-71 uses the same generic event-play viability contract as other cards; no card-local fallback remains.
3. The final authoring is at least as strict as the board-game rule text and strictly cleaner than the current workaround.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — assert the shaded grant shape again includes `requireUsableForEventPlay`.
2. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — add a negative event-gating case where the card is suppressed because no legal troop March into a City exists.
3. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — preserve the existing runtime coverage for Monsoon March, troop-only legality, same-city binding, and two Attacks.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-an-loc.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
