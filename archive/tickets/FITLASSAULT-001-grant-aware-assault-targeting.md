# FITLASSAULT-001: Refactor FITL Assault data to use one shared targeted Assault path

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No — depends on generic engine support from `FREEOP-001`, but this ticket changes FITL data/tests only
**Deps**: FREEOP-001, `tickets/README.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/test/integration/fitl-coin-operations.test.ts`, `packages/engine/test/integration/fitl-removal-ordering.test.ts`, `packages/engine/test/integration/fitl-events-chu-luc.test.ts`

## Problem

Fire in the Lake Assault data currently has two removal paths:

1. the shared `coin-assault-removal-order` path used by normal COIN Assault profiles, and
2. a bespoke `coin-assault-removal-order-single-faction` helper used by `card-47` (Chu Luc).

That split is rules-correct today, but it duplicates Assault removal logic and creates drift risk for future rule fixes.

## Assumption Reassessment (2026-03-09)

1. `FREEOP-001` is already complete: the engine now transports generic free-operation `executionContext` and exposes it to data as `grantContext`.
2. `data/games/fire-in-the-lake/20-macros.md` still contains `coin-assault-removal-order-single-faction`, added specifically so Chu Luc can remove NVA only while preserving Assault ordering/base-protection behavior.
3. `data/games/fire-in-the-lake/30-rules-actions.md` still routes normal US/ARVN Assault through `coin-assault-removal-order`, and those profiles currently express only the default “all insurgents” targeting semantics.
4. `data/games/fire-in-the-lake/41-content-event-decks.md` still calls the bespoke single-faction helper directly for Chu Luc unshaded.
5. `packages/engine/test/integration/fitl-coin-operations.test.ts`, `packages/engine/test/integration/fitl-removal-ordering.test.ts`, and `packages/engine/test/integration/fitl-events-chu-luc.test.ts` already cover the default Assault path plus Chu Luc’s targeted runtime behavior.
6. Mismatch: the earlier ticket boundary was too grant-centric. The cleaner abstraction is not “shared Assault macros read grant context directly”; it is “shared Assault macros accept explicit target-faction mode, and any action/event data may source that mode from ordinary literals or from `grantContext` later.”

## Architecture Check

1. One shared FITL Assault helper with an explicit target-faction mode is cleaner than keeping a second single-faction macro family.
2. `grantContext` should be interpreted one layer up in action/event data, not inside the shared Assault macro itself; that keeps the macro reusable by both granted and non-granted callers.
3. The engine stays agnostic because the meaning of the target selector lives entirely in FITL `GameSpecDoc` data and tests.
4. No compatibility shim should preserve the bespoke single-faction helper once the shared path is working; remove the duplicate path rather than maintaining both.

## What to Change

### 1. Unify the shared FITL Assault path around an explicit target-faction mode

Refactor the shared Assault/removal macros so one path can express both the default all-insurgent Assault and a single-faction-targeted Assault through an explicit selector such as `all` / `NVA` / `VC`.

### 2. Keep normal Assault behavior unchanged by default

Paid Assault, ordinary free Assault, ARVN follow-up Assault, and capability-driven variants must continue to resolve exactly as they do now when no target restriction is present.

### 3. Move the current production targeted consumer onto the shared path

Update Chu Luc to call the shared Assault helper with the targeted mode instead of `coin-assault-removal-order-single-faction`.

### 4. Remove the bespoke single-faction Assault helper

Delete `coin-assault-removal-order-single-faction` after the shared Assault path can express the same behavior.

### 5. Update regression tests

Update structural/runtime assertions to reflect the shared target-aware path and preserve Chu Luc plus default Assault behavior.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-coin-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-removal-ordering.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-chu-luc.test.ts` (modify)

## Out of Scope

- Changing non-Assault COIN operations unless they also need the same shared target-selector surface.
- Introducing Fire in the Lake-specific branches in engine code.
- Adding new engine-side special cases for grant-aware Assault targeting.

## Acceptance Criteria

### Tests That Must Pass

1. Normal ARVN Assault still removes insurgent pieces in the current printed order when no grant-scoped target restriction exists.
2. The shared COIN Assault helper can resolve NVA-only (and VC-only, if expressed) targeting without a bespoke duplicate helper.
3. Chu Luc unshaded now uses that shared targeted-Assault path while preserving its existing runtime behavior.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL target-selector semantics live in game data, not kernel special cases.
2. There is only one shared COIN Assault removal path after the refactor; no duplicate Chu Luc-only helper remains.

## Tests

1. Update `packages/engine/test/integration/fitl-removal-ordering.test.ts` to assert the new shared macro contract and the removal of the duplicate single-faction helper.
2. Update `packages/engine/test/integration/fitl-events-chu-luc.test.ts` so it asserts Chu Luc uses the shared helper while preserving the existing targeted runtime behavior.
3. Keep `packages/engine/test/integration/fitl-coin-operations.test.ts` aligned with the default Assault call shape.
4. Run the focused FITL Assault/Chu Luc suites and then the broader engine test suite.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coin-operations.test.ts` — keep default Assault call-shape assertions aligned with the shared selector contract.
2. `packages/engine/test/integration/fitl-removal-ordering.test.ts` — update structural assertions around the unified removal macro and add targeted shared-path coverage.
3. `packages/engine/test/integration/fitl-events-chu-luc.test.ts` — assert the production consumer moved from the bespoke helper to the shared targeted path without changing runtime outcomes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-coin-operations.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/integration/fitl-removal-ordering.test.ts`
4. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
5. `pnpm -F @ludoforge/engine test`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- What actually changed:
  - Replaced the duplicate Chu Luc-only single-faction Assault helper with one shared `coin-assault-removal-order` contract that accepts an explicit FITL target-faction mode (`all` / `NVA` / `VC`).
  - Kept ordinary US/ARVN Assault callers on explicit `all` targeting and rewired Chu Luc unshaded onto the same shared helper with `NVA` targeting.
  - Kept the grant-aware engine work out of this ticket; the shared FITL helper now accepts explicit targeting inputs, and any future grant-aware caller can map `grantContext` into that input one layer up.
  - Tightened regression coverage so the macro contract, default Assault call sites, and Chu Luc’s production/runtime behavior all assert the unified path.
- Deviations from original plan:
  - The ticket no longer makes the shared FITL Assault macro read grant context directly. That boundary was corrected because direct grant-context coupling would be less reusable than an explicit target selector in FITL data.
  - Chu Luc event data was updated here so the ticket closes with a real production consumer on the shared path, making the follow-on duplicate-helper step unnecessary.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-removal-ordering.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-coin-operations.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
