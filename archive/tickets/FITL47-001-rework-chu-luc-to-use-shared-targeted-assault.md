# FITL47-001: Verify and close Chu Luc shared targeted-Assault rework

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No — current architecture is already in the desired generic/data-authored shape
**Deps**: `tickets/README.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/test/integration/fitl-events-chu-luc.test.ts`, `packages/engine/test/integration/fitl-events-1965-nva.test.ts`, `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts`, `archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md`, `archive/tickets/FITLASSAULT-002-rework-targeted-assault-on-dynamic-filter-engine-support.md`, `archive/tickets/FREEOP-001-grant-scoped-action-context.md`

## Problem

This ticket originally assumed Chu Luc still needed to be moved off a bespoke single-faction Assault helper and onto a cleaner shared targeted-Assault path. That assumption is now stale.

The current code already encodes Chu Luc on the shared `coin-assault-removal-order` path with canonical `targetFactions`, keeps the event data-authored, and preserves the mandatory "assault every eligible ARVN + exposed NVA space" semantics. The remaining work is to correct the ticket to reality, verify the architecture is still the right one, and harden the broader regression surface so this shape does not drift.

## Assumption Reassessment (2026-03-09)

1. `archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md` and `archive/tickets/FITLASSAULT-002-rework-targeted-assault-on-dynamic-filter-engine-support.md` are already complete; the shared targeted-Assault rework has landed.
2. `data/games/fire-in-the-lake/41-content-event-decks.md` currently encodes Chu Luc unshaded as event effects: choose one ARVN+NVA space to double ARVN pieces there, then `forEach` every eligible ARVN + exposed-NVA space and invoke shared `coin-assault-removal-order` with `targetFactions: [NVA]`.
3. `coin-assault-removal-order-single-faction` is already removed from the production macros and should not be reintroduced.
4. `packages/engine/test/integration/fitl-events-chu-luc.test.ts` already verifies the dedicated Chu Luc runtime behavior and the absence of legacy helper/alias contracts.
5. The current ticket's original dependency paths were stale: `FITLASSAULT-002` and `FREEOP-001` are archived, not active-ticket dependencies.
6. Mismatch corrected: there is no remaining architecture benefit in converting Chu Luc into a `freeOperationGrants`-driven player-choice flow. That would be worse than the current design because it would relax mandatory exhaustive event semantics.

## Architecture Check

1. The current architecture is better than the ticket's original proposed direction. Chu Luc is encoded as data-authored event effects plus one shared Assault-removal helper, which preserves the printed mandatory all-space behavior without introducing engine special cases.
2. Keeping Chu Luc out of `freeOperationGrants` is correct. A grant is a reusable player-executed operation surface; Chu Luc is a deterministic event resolution that must execute across all eligible spaces, so a grant-shaped abstraction would be the wrong boundary.
3. The stable long-term architecture here is:
   - one shared FITL Assault removal path,
   - explicit `targetFactions` in data,
   - event-local looping only where the card text requires exhaustive resolution,
   - no aliasing and no card-specific engine hooks.
4. No production code rewrite is justified unless a new requirement exposes a gap in the shared `targetFactions` path itself.

## What to Change

### 1. Correct the ticket scope

Rewrite this ticket so it reflects the current codebase, current dependency paths, and the architectural conclusion that no further Chu Luc production-code rework is desirable.

### 2. Tighten broader regression coverage

Strengthen the non-dedicated Chu Luc suites so they also pin the architectural invariants:

1. no `freeOperationGrants` on Chu Luc unshaded,
2. shared `coin-assault-removal-order` is the only helper path,
3. legacy single-faction helper/alias contracts remain absent.

### 3. Verify the current shape, then close

Run the focused Chu Luc/1965/backfill suites plus lint and ticket-dependency checks. If they pass, mark this ticket complete and archive it with an Outcome that explains the real result versus the original plan.

## Files to Touch

- `tickets/FITL47-001-rework-chu-luc-to-use-shared-targeted-assault.md` (modify)
- `packages/engine/test/integration/fitl-events-1965-nva.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify)

## Out of Scope

- Changing Chu Luc shaded behavior.
- Reintroducing `freeOperationGrants` or any player-choice Assault flow for Chu Luc unshaded.
- Adding FITL-specific engine logic.
- Reworking `packages/engine/test/integration/fitl-events-chu-luc.test.ts` beyond what is already necessary for current coverage.

## Acceptance Criteria

### Tests That Must Pass

1. The dedicated Chu Luc suite still proves unshaded doubling plus exhaustive NVA-only Assault behavior.
2. The 1965 NVA production-deck suite and text-only backfill suite both assert the final shared-path shape for card 47.
3. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
4. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-1965-nva.test.ts`
5. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-text-only-behavior-backfill.test.ts`
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm run check:ticket-deps`

### Invariants

1. Chu Luc remains encoded in data and uses the shared targeted-Assault helper.
2. Chu Luc unshaded does not expose a looser grant-shaped player-choice API.
3. No legacy single-faction helper or selector alias contract is reintroduced.

## Tests

1. Strengthen `packages/engine/test/integration/fitl-events-1965-nva.test.ts` so card 47 also asserts no `freeOperationGrants` and no legacy helper reference.
2. Strengthen `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` with the same architectural assertions for card 47.
3. Re-run the dedicated Chu Luc suite to confirm the broader assertions still align with runtime behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-1965-nva.test.ts` — broad production-deck assertion that card 47 stays on the shared helper path and not on `freeOperationGrants`.
2. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — backfill assertion that card 47 still encodes the final non-legacy targeted-Assault shape.

### Commands

1. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-1965-nva.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-text-only-behavior-backfill.test.ts`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-09
- What actually changed:
  - Rewrote the ticket so its assumptions, dependency paths, and scope match the current codebase rather than the obsolete pre-refactor state.
  - Confirmed the current architecture is already the correct long-term shape: Chu Luc stays data-authored, uses shared `coin-assault-removal-order` with explicit `targetFactions`, and does not expose a looser `freeOperationGrants` path.
  - Strengthened broader regression coverage in the 1965 NVA production-deck suite and the text-only behavior backfill suite so card 47 now also asserts the absence of `freeOperationGrants`, the presence of the shared helper path, and the continued absence of the removed single-faction helper.
- Deviations from original plan:
  - No production engine or FITL data rework was performed because the originally proposed architecture change had already landed and is better than the ticket's earlier assumptions.
  - The ticket closed as a verification-and-hardening pass rather than a new behavior change.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-1965-nva.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-text-only-behavior-backfill.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm run check:ticket-deps`
