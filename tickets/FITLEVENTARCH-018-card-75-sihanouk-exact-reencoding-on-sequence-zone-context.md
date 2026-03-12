# FITLEVENTARCH-018: Card 75 Sihanouk Exact Re-encoding on Sequence-Zone Context

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — depends on generic free-operation captured-zone support; FITL data/test changes required
**Deps**: `tickets/README.md`, `tickets/ENGINEARCH-209-sequence-captured-zone-sets-for-later-grant-evaluation.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `reports/fire-in-the-lake-rules-section-3.md`, `reports/fire-in-the-lake-rules-section-5.md`, `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts`, `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts`, `packages/engine/test/integration/fitl-events-operation-attleboro.test.ts`, `packages/engine/test/integration/fitl-insurgent-operations.test.ts`

## Problem

`card-75` is currently encoded as a placeholder skeleton that does not match the actual event text or playbook detail.

Missing behavior includes:
- unshaded branch choice between US and ARVN execution
- free Sweep into/in Cambodia, then free Assault in one space
- free US Assault preserving the ARVN follow-up at cost 0
- shaded sequencing `VC` first and `NVA` second
- Rally in Cambodia followed by March only from spaces that just Rally'd
- NVA Trail-chain continuation from just-Rally'd Cambodia spaces when Trail is above 0

## Assumption Reassessment (2026-03-12)

1. `data/games/fire-in-the-lake/41-events/065-096.md` currently encodes card 75 only as broad Cambodia-filtered free-operation grants, which is materially incomplete.
2. Existing FITL event data already demonstrates the generic building blocks needed around this card: execute-as-seat COIN operations, Monsoon bypass on free Sweep/March, deferred `effectTiming: afterGrants`, and strict sequence-context capture for same-batch follow-ups.
3. The current blocker for shaded exactness is architectural, not game-data-only: exact `March from any Rally spaces` depends on the engine exposing earlier captured zone sets to later grant evaluation. Corrected scope: wait for the generic engine capability, then re-encode the card without FITL-specific runtime hacks.
4. Existing test coverage around `Vo Nguyen Giap`, `Operation Attleboro`, and insurgent March rules already covers adjacent contracts and should be reused rather than duplicated.

## Architecture Check

1. Re-encoding card 75 after the generic engine change is cleaner than embedding card-specific exceptions or over-specialized action profiles.
2. The card behavior belongs in `GameSpecDoc` FITL data and FITL tests, while the engine capability that makes it possible belongs in shared kernel/compiler layers.
3. No backwards-compatibility shim should preserve the placeholder encoding. Replace it with one canonical exact encoding once the supporting engine contract exists.
4. Any helper macros added for readability must remain generic to FITL authored data and must not leak into the shared game-agnostic runtime as card-specific branches.

## What to Change

### 1. Replace the placeholder unshaded encoding with exact branch behavior

Encode:
- `US` executes the event as `US`, or
- `ARVN` executes the event as `ARVN`

The unshaded branch must:
- allow free Sweep into/in Cambodia even during Monsoon
- follow with free Assault in exactly one Cambodia space
- preserve the normal zero-cost ARVN follow-up when the free Assault executes as `US`

### 2. Re-encode the shaded branch as staged exact sequences

Encode the shaded branch so that:
- `VC` resolves Rally in Cambodia first
- `VC` then receives only the follow-up March authorized by the spaces that just Rally'd
- after the `VC` batch completes or proves unusable, `NVA` resolves the same pattern
- `NVA` Trail-chain continuation remains available exactly where the rules allow it

### 3. Add focused regression coverage

Add tests that lock in:
- branch metadata/compile shape
- exact unshaded execution semantics
- exact shaded Rally-to-March origin restriction
- Monsoon and Trail edge cases
- unusable-first-faction sequencing behavior

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts` (new)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify if shared sequence-grant behavior needs a FITL-level regression)

## Out of Scope

- Broader refactoring of unrelated FITL event cards unless card 75 reuse falls out naturally.
- Generic engine work already covered by `tickets/ENGINEARCH-209-sequence-captured-zone-sets-for-later-grant-evaluation.md`.
- Visual presentation changes.

## Acceptance Criteria

### Tests That Must Pass

1. Card 75 unshaded supports both `US` and `ARVN` execution and enforces Cambodia-only free Sweep plus exactly-one-space free Assault.
2. Card 75 shaded allows March only from the spaces that just Rally'd for the active faction batch, with `VC` resolving before `NVA`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card 75 behavior is encoded in FITL `GameSpecDoc` data/tests, not by FITL-specific branches in generic engine code.
2. The final encoding uses the canonical generic captured-zone contract delivered by the engine ticket and does not add parallel authoring mechanisms.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-sihanouk.test.ts` — exact end-to-end card behavior, including unshaded branches, shaded sequencing, and edge cases.
2. `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` — replace placeholder compile assertions with exact-structure expectations for the final card encoding.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a FITL-motivated regression only if the generic contract needs a production-data example.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-sihanouk.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-medium.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
