# FITLEVENTARCH-018: Card 75 Sihanouk Exact Re-encoding on Sequence-Zone Context

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Added one generic kernel/compiler surface for dynamically keyed `capturedSequenceZones`, then re-encoded FITL March/card-75 authored data on top of it
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-209-sequence-captured-zone-sets-for-later-grant-evaluation.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `rules/fire-in-the-lake/fire-in-the-lake-rules-section-3.md`, `rules/fire-in-the-lake/fire-in-the-lake-rules-section-5.md`, `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts`, `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts`, `packages/engine/test/integration/fitl-events-operation-attleboro.test.ts`, `packages/engine/test/integration/fitl-insurgent-operations.test.ts`

## Problem

`card-75` is currently encoded as a placeholder skeleton that does not match the actual event text or playbook detail.

Missing behavior includes:
- unshaded branch choice between US and ARVN execution
- free Sweep into/in Cambodia, then free Assault in one space
- free US Assault preserving the ARVN follow-up at cost 0
- shaded sequencing `VC` first and `NVA` second
- Rally in Cambodia followed by March only from spaces that just Rally'd
- NVA Trail-chain continuation from just-Rally'd Cambodia spaces when Trail is above 0

## Assumption Reassessment (2026-03-13)

1. `data/games/fire-in-the-lake/41-events/065-096.md` currently encodes card 75 only as broad Cambodia-filtered free-operation grants, which is materially incomplete.
2. `archive/tickets/ENGINEARCH-209-sequence-captured-zone-sets-for-later-grant-evaluation.md` is already completed, and the live engine now exposes `capturedSequenceZones` plus the underlying runtime state needed for later grant evaluation. The ticket is no longer blocked on that prerequisite.
3. Existing FITL production data already demonstrates the main generic building blocks needed around this card: dual branch seat selection, `executeAsSeat`, Monsoon bypass on free Sweep/March, deferred `effectTiming: afterGrants`, same-batch sequence capture, and captured-zone reads in later grant evaluation.
4. Reassessment update: the remaining gap appears to be at the FITL authored-data layer, not the shared kernel. The shared insurgent March macros currently expose destination selection/resolution only; exact card-75 shaded behavior likely needs those reusable FITL macros/profiles to accept a declarative origin-space restriction sourced from the existing captured-sequence context.
5. Corrected scope: start with a FITL data/test implementation using the current generic contract and, if needed, a reusable FITL March macro/profile enhancement. If exact shaded sequencing still exposes a missing shared-kernel contract after that, stop and spin it out into a separate engine ticket rather than patching card 75 with FITL-specific runtime behavior.
6. Existing coverage around `Amphib Landing`, `Cambodian Civil War`, `Vo Nguyen Giap`, `Operation Attleboro`, and insurgent March rules already exercises the adjacent generic contracts and should be reused rather than duplicated.

## Architecture Check

1. Re-encoding card 75 in authored FITL data is cleaner than embedding event-specific branches or widening the generic runtime for one card.
2. If shaded exactness needs new reuse points, the first place to add them is the FITL authored-data layer (`20-macros.md` / `30-rules-actions.md`), not the shared kernel, because the missing concept is a reusable FITL March-origin restriction rather than a game-agnostic execution primitive already absent from the engine.
3. No backwards-compatibility shim should preserve the placeholder encoding. Replace it with one canonical exact encoding once the current generic contract proves sufficient.
4. If additional readability helpers are introduced, they must stay at the FITL authored-data layer and must not leak game-specific identifiers into shared runtime code.

## What to Change

### 1. Replace the placeholder unshaded encoding with exact branch behavior

Encode:
- `US` executes the event as `US`, or
- `ARVN` executes the event as `ARVN`

The unshaded branch must:
- allow free Sweep into/in Cambodia even during Monsoon
- follow with free Assault in exactly one Cambodia space
- preserve the normal zero-cost ARVN follow-up when the free Assault executes as `US`

### 2. Re-encode the shaded branch as staged exact sequences, if the existing generic sequencing model can express it cleanly

Encode the shaded branch so that:
- `VC` resolves Rally in Cambodia first
- `VC` then receives only the follow-up March authorized by the spaces that just Rally'd
- after the `VC` batch completes or proves unusable, `NVA` resolves the same pattern
- `NVA` Trail-chain continuation remains available exactly where the rules allow it

Do not add FITL-specific runtime branches or parallel authoring mechanisms to force this through. Prefer a reusable FITL March macro/profile enhancement if the current March authored-data surface cannot yet express the origin restriction. If exact staged sequencing still cannot be expressed without a reusable shared-kernel enhancement after that, stop this ticket at the cleanest supported boundary and open the follow-on engine ticket first.

### 3. Add focused regression coverage

Add tests that lock in:
- branch metadata/compile shape
- exact unshaded execution semantics
- exact shaded Rally-to-March origin restriction
- Monsoon and Trail edge cases
- unusable-first-faction sequencing behavior

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify if a shared FITL March-origin restriction hook is needed)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify if shared insurgent March profiles need the new authored-data hook)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts` (new)
- `packages/engine/test/integration/fitl-insurgent-operations.test.ts` (modify if shared FITL March profile behavior changes)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify only if implementation exposes a missing generic regression worth locking in)

## Out of Scope

- Broader refactoring of unrelated FITL event cards unless card 75 reuse falls out naturally.
- Reopening or silently folding in unrelated engine refactors when card 75 can be expressed cleanly in existing authored-data contracts.
- Card-specific March-profile forks when the behavior can be expressed through a reusable FITL March macro/profile parameter.
- Visual presentation changes.

## Acceptance Criteria

### Tests That Must Pass

1. Card 75 unshaded supports both `US` and `ARVN` execution and enforces Cambodia-only free Sweep plus exactly-one-space free Assault.
2. Card 75 shaded allows March only from the spaces that just Rally'd for the active faction batch, with `VC` resolving before `NVA`, or the ticket is explicitly split because a reusable generic sequencing gap remains.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card 75 behavior is encoded in FITL `GameSpecDoc` data/tests, not by FITL-specific branches in generic engine code.
2. The final encoding uses the canonical generic sequencing/captured-zone contracts already in the engine and, if needed, one reusable FITL March-origin authored-data surface rather than card-specific profile forks or alias mechanisms.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-sihanouk.test.ts` — exact end-to-end card behavior, including unshaded branches, shaded sequencing, and edge cases.
2. `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` — replace placeholder compile assertions with exact-structure expectations for the final card encoding.
3. `packages/engine/test/integration/fitl-insurgent-operations.test.ts` — add coverage only if shared FITL March macros/profiles gain a reusable origin-restriction surface.
4. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a regression only if implementation reveals a generic sequencing or captured-zone contract that needs coverage beyond card-75 integration tests.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-sihanouk.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-medium.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-13
- What actually changed:
  - Added a generic `capturedSequenceZones` key-expression surface that can resolve from `binding` or `grantContext`, and wired it through kernel AST/schema, compiler lowering, query/ref resolution, predicate evaluation, validation, display, and tooltip layers.
  - Extended canonical token-filter field selectors so authored queries can filter on `tokenZone` directly, which the shared FITL March macros now use for origin-space restriction.
  - Reworked the shared insurgent March authored-data macros/profiles to support optional origin restriction without breaking LimOp caps or NVA Trail chaining.
  - Re-encoded card 75 exactly:
    - unshaded now has explicit US and ARVN execution branches
    - shaded now uses one canonical four-step free-operation sequence: VC Rally, VC March, NVA Rally, NVA March
  - Hardened Cambodia/Laos neutral-only support handling exposed by the new card path via the Search-and-Destroy authored-data guard.
- Deviations from original plan:
  - The early ticket assumption that this would stay entirely inside FITL authored data was wrong. Exact shaded behavior exposed a missing reusable generic contract for dynamically keyed captured sequence zones, so the final implementation included a small game-agnostic kernel/compiler enhancement rather than a FITL-specific workaround.
  - The final shaded implementation is cleaner than the intermediate deferred-effect grant plan. It now uses a single canonical free-operation batch instead of issuing follow-up grants from deferred effects.
  - One ARVN-branch test assumption was corrected during implementation: ARVN Sweep uses its own canonical mover binding surface, not the US Sweep `$movingAdjacentTroops` surface.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/unit/schemas-ast.test.js`
  - `node packages/engine/dist/test/integration/compile-pipeline.test.js`
  - `node packages/engine/dist/test/integration/fitl-insurgent-operations.test.js`
  - `node packages/engine/dist/test/integration/fitl-events-tutorial-medium.test.js`
  - `node packages/engine/dist/test/integration/fitl-events-sihanouk.test.js`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
