# FITLEVECARENC-026: Card-71 An Loc full-fidelity rework

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None in this ticket closure
**Deps**: archive/tickets/ENG-227-constrained-event-grant-viability-preflight.md, data/games/fire-in-the-lake/41-events/065-096.md, packages/engine/test/integration/fitl-event-free-operation-grants.test.ts, packages/engine/test/integration/fitl-events-an-loc.test.ts

## Problem Reassessment

This ticket was written against a stale assumption: that Card-71 `An Loc` still depended on a temporary shaded-side workaround and still needed post-ENG-227 implementation work. Current code no longer matches that assumption. The generic architecture requested here has already landed elsewhere, and `An Loc` is already authored and tested in the intended declarative form.

## Assumption Reassessment (2026-03-12)

1. `data/games/fire-in-the-lake/41-events/065-096.md` already restores `viabilityPolicy: requireUsableForEventPlay` on Card-71's constrained shaded March grant.
2. `packages/engine/test/integration/fitl-events-an-loc.test.ts` already asserts the restored shaded grant shape and covers the runtime sequence: Monsoon-legal free March, troop-only witness legality, exact-city binding, and the two follow-up Attacks.
3. `packages/engine/test/integration/fitl-events-an-loc.test.ts` already includes the negative event-gating regression where shaded is suppressed when no legal troop March into a City exists.
4. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` already includes the generic regression that keeps `requireUsableForEventPlay` playable when a witness move must capture downstream sequence context.
5. The generic kernel improvement this ticket depended on was already delivered by `archive/tickets/ENG-227-constrained-event-grant-viability-preflight.md`.

## Architecture Reassessment

1. The current architecture is better than the architecture implied by the original ticket because it keeps one canonical, generic event-play viability path instead of adding card-local logic or a second legality subsystem.
2. `An Loc` is already encoded where it belongs: declaratively in FITL event data, with FITL-specific behavior locked by FITL integration tests.
3. No backwards-compatibility aliasing remains necessary here. The current authoring is already the clean, strict form this ticket wanted.
4. I do not recommend further architecture changes in this area for this ticket. The current design is the correct long-term shape: generic kernel viability, declarative game data, and card-specific regressions only at the test layer.

## Scope Correction

This ticket no longer owns implementation work. Its remaining work was to:

1. verify whether the requested implementation still needed to happen,
2. confirm the existing code and tests already satisfy the intended contract,
3. close and archive the ticket with an accurate outcome record.

## Files Verified

- `data/games/fire-in-the-lake/41-events/065-096.md`
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
- `packages/engine/test/integration/fitl-events-an-loc.test.ts`
- `packages/engine/src/kernel/free-operation-viability.ts`
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts`

## Acceptance Criteria Status

1. Card-71 shaded uses `viabilityPolicy: requireUsableForEventPlay`. `Satisfied`.
2. Card-71 shaded is suppressed when no legal troop-into-City March witness exists. `Satisfied`.
3. Card-71 shaded remains legal when such a witness exists, including Monsoon-legal free March behavior. `Satisfied`.
4. Runtime sequence still enforces same-city double Attack after the March. `Satisfied`.
5. Generic event-play viability remains canonical and game-agnostic. `Satisfied`.

## Test Inventory Reassessed

### Existing Tests Covering The Ticket

1. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — asserts Card-71 shaded again includes `requireUsableForEventPlay`.
2. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — suppresses shaded when no legal troop March into a City witness exists.
3. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — preserves runtime coverage for Monsoon March, troop-only legality, exact-city binding, and two same-city Attacks.
4. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — proves `requireUsableForEventPlay` remains playable when the witness move must capture downstream sequence context.

### New/Modified Tests In This Ticket Closure

None. The tests this ticket called for were already present before this reassessment.

## Verification Run (2026-03-12)

1. `pnpm -F @ludoforge/engine build` — passed
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` — passed
3. `node --test packages/engine/dist/test/integration/fitl-events-an-loc.test.js` — passed
4. `pnpm turbo lint` — passed with existing repo warnings only; no lint errors
5. `pnpm run check:ticket-deps` — passed

## Outcome

- What was actually changed:
  - Reassessed the ticket against the current code and test suite.
  - Corrected the ticket's stale assumptions and reduced its scope from implementation to verification and archival.
  - Confirmed the desired architecture and regressions were already delivered by prior generic engine work and existing FITL tests.
- What was not changed:
  - No engine code changed.
  - No FITL data changed.
  - No tests changed.
- Deviation from original plan:
  - The original ticket expected pending implementation work after ENG-227. That work had already landed, so the correct action was not to re-implement anything, but to close the stale ticket and archive it accurately.
