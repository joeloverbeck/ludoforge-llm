# FITL47-001: Rework Chu Luc to use the shared targeted-Assault path

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — depends on `FREEOP-001`; FITL event data changes depend on `FITLASSAULT-001`
**Deps**: FREEOP-001, FITLASSAULT-001, `tickets/README.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/test/integration/fitl-events-chu-luc.test.ts`, `packages/engine/test/integration/fitl-events-1965-nva.test.ts`

## Problem

`card-47` (Chu Luc) currently resolves its unshaded Assault via bespoke event effects plus a dedicated single-faction removal macro. That implementation is rules-correct, but it does not rely on the shared solution to the grant-scoped targeting gap and will drift if Assault logic changes again.

The card also has a second subtlety that must be preserved during the rework: the playbook text requires Assault resolution in every eligible ARVN + Active NVA space, not a player-chosen subset. The rework therefore must remove the current workaround without regressing the exhaustive all-space resolution semantics.

## Assumption Reassessment (2026-03-09)

1. `data/games/fire-in-the-lake/41-content-event-decks.md` currently implements Chu Luc unshaded as: choose one ARVN+NVA space to double ARVN pieces there, then `forEach` across all eligible spaces and call `coin-assault-removal-order-single-faction` with `targetFaction: NVA`.
2. `packages/engine/test/integration/fitl-events-chu-luc.test.ts` explicitly asserts that `card-47` currently has no `freeOperationGrants` and resolves via direct event effects.
3. The printed/playbook behavior still requires NVA-only removals and exhaustive resolution across all ARVN + exposed-NVA spaces; simply converting the card to an unconstrained free Assault grant would be behaviorally incorrect.
4. Mismatch: "rely on the solution" does not necessarily mean "queue a normal user-chosen free-operation move". The corrected scope is to route Chu Luc through the new shared targeted-Assault infrastructure while preserving its mandatory all-space event resolution semantics.

## Architecture Check

1. Reusing the shared targeted-Assault path is cleaner than preserving a Chu Luc-only removal macro or copying more Assault rules into card data.
2. The event remains encoded in FITL `GameSpecDoc` data; engine/runtime stay agnostic.
3. No compatibility shim should leave the old bespoke helper in place once the shared path can express the same behavior.

## What to Change

### 1. Replace the bespoke single-faction helper usage in Chu Luc

Rewrite the unshaded event implementation to call the shared targeted-Assault path introduced by `FITLASSAULT-001` instead of `coin-assault-removal-order-single-faction`.

### 2. Preserve exhaustive event resolution semantics

Keep the current "double one eligible space, then resolve NVA-only Assault in each eligible ARVN + Active NVA space" behavior exactly. If the new shared path still requires an event-local loop to enforce exhaustive coverage, keep the loop and remove only the bespoke removal workaround.

### 3. Reassess whether any free-operation grant should remain

If `FREEOP-001` makes it possible to express a useful shared grant/context for some portion of Chu Luc, use it only if it does not relax the playbook-mandated exhaustive resolution. Do not replace rules-correct event execution with a looser player-choice grant just to reuse machinery.

### 4. Tighten Chu Luc regression coverage

Update the card-encoding assertions so they validate reliance on the shared targeted-Assault path rather than the old bespoke helper, while keeping the existing runtime edge cases intact.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-chu-luc.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1965-nva.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify)

## Out of Scope

- Changing Chu Luc shaded behavior.
- Relaxing the playbook requirement that every eligible ARVN + Active NVA space resolves.
- Adding a Chu Luc-specific engine handler.

## Acceptance Criteria

### Tests That Must Pass

1. Chu Luc unshaded still doubles ARVN pieces in one eligible space and then resolves NVA-only Assault in every eligible ARVN + Active NVA space.
2. Chu Luc no longer depends on `coin-assault-removal-order-single-faction` or any equivalent bespoke card-only Assault workaround.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Chu Luc uses shared targeted-Assault semantics rather than a duplicated card-specific removal path.
2. The card remains encoded in data and does not introduce FITL-specific engine logic.

## Tests

1. Update `packages/engine/test/integration/fitl-events-chu-luc.test.ts` to assert the card no longer depends on the bespoke helper and still preserves all current runtime edge cases.
2. Keep the deck/backfill tests aligned so card 47 remains covered in both production-compilation and behavior-backfill suites.
3. Run focused Chu Luc tests, then the broader engine suite.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-chu-luc.test.ts` — update structural assertions and preserve runtime edge-case coverage.
2. `packages/engine/test/integration/fitl-events-1965-nva.test.ts` — keep production deck assertions aligned with the new implementation shape.
3. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — preserve text/behavior backfill coverage for card 47.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-1965-nva.test.ts`
4. `pnpm -F @ludoforge/engine test`
