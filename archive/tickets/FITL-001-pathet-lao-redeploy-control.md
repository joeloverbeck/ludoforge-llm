# FITL-001: Narrow Pathet Lao ARVN Police redeploy to US/ARVN control

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: `tickets/README.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, `rules/fire-in-the-lake/fire-in-the-lake-rules-section-6.md`

## Problem

`card-58` Pathet Lao currently allows ARVN Police to redeploy into any South Vietnam LoC or any space matching the shared `fitl-space-coin-controlled` macro. That macro counts `VC` as part of COIN control, so the event can illegally send ARVN Police into VC-only controlled spaces. The playbook clarification for this card says `COIN` means `US` or `ARVN`, not `VC`.

## Assumption Reassessment (2026-03-10)

1. Current production data for `card-58` routes ARVN Police through `fitl-space-coin-controlled` in `data/games/fire-in-the-lake/41-content-event-decks.md`.
2. `rules/fire-in-the-lake/fire-in-the-lake-rules-section-6.md` section 6.4.2 confirms the baseline redeploy destinations for ARVN Police: South Vietnam LoCs or COIN Controlled spaces. No repo-local playbook artifact currently documents the narrower `US`/`ARVN`-only interpretation for `card-58`, so this ticket should record that interpretation explicitly rather than implying an existing repository citation.
3. Existing integration coverage in `packages/engine/test/integration/fitl-events-pathet-lao.test.ts` already proves most shaded redeploy behavior, including legal LoC and ARVN-Troop destination handling. The missing regression is the negative case where ARVN Police are incorrectly allowed into a South Vietnam space controlled only by `VC`.
4. The mismatch is in FITL game data semantics, not in the agnostic engine. The correction belongs in FITL GameSpecDoc data, optionally with a new FITL macro if that is the cleanest reuse point.

## Architecture Check

1. The clean fix is to encode the narrower control subset in FITL data, not to special-case `card-58` or redefine generic control in engine code.
2. A FITL-specific macro such as `fitl-space-us-arvn-controlled` keeps game semantics in `GameSpecDoc` and preserves `GameDef`/runtime agnosticism.
3. No backwards-compatibility shims are needed; this ticket should tighten current behavior directly.

## What to Change

### 1. Add a FITL-specific control predicate for this rules subset

Introduce or inline a predicate that treats only `US` and `ARVN` pieces as satisfying the “COIN” part of Pathet Lao’s police redeploy clause.

### 2. Update card-58 shaded police redeploy destinations

Replace the current `fitl-space-coin-controlled` usage for ARVN Police destinations with the narrower `US/ARVN` control predicate while keeping LoCs legal destinations.

### 3. Add rule-accurate regression coverage

Strengthen the existing `fitl-events-pathet-lao` integration coverage with a regression proving ARVN Police cannot redeploy into a South Vietnam space controlled only by `VC`, while still being able to redeploy to:
- a South Vietnam LoC
- a South Vietnam space controlled by `US`/`ARVN`

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-pathet-lao.test.ts` (modify)

## Out of Scope

- Redefining generic FITL “COIN control” everywhere.
- Engine/runtime support for card-specific control semantics.
- Unrelated card-57 / International Unrest work.

## Acceptance Criteria

### Tests That Must Pass

1. `card-58` shaded rejects ARVN Police redeploy to a South Vietnam space that is controlled only by `VC`.
2. `card-58` shaded still permits ARVN Police redeploy to LoCs and to South Vietnam spaces controlled by `US` and/or `ARVN`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL-specific control semantics remain encoded in GameSpecDoc/macros, not in `GameDef`, simulator, or kernel branches.
2. Shared macros keep their existing meanings unless intentionally narrowed by a new FITL-specific macro with explicit naming.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-pathet-lao.test.ts` — extend the existing shaded redeploy test to assert that VC-only-controlled South Vietnam spaces are not offered as ARVN Police destinations while LoCs and US/ARVN-controlled spaces remain legal.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node dist/test/integration/fitl-events-pathet-lao.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-10
- What actually changed: Added FITL macro `fitl-space-us-arvn-controlled`, switched `card-58` shaded ARVN Police redeploy destinations to that narrower predicate, and strengthened the existing Pathet Lao integration test to assert that VC-only-controlled South Vietnam spaces are not offered as police destinations while LoCs and US/ARVN-controlled spaces remain legal.
- Deviations from original plan: Reused and extended the existing shaded redeploy test instead of adding a separate case for each positive destination class, because the file already covered the legal LoC and US/ARVN-controlled paths. Also corrected the ticket to reflect that the repo lacked a local playbook artifact for the card-specific clarification.
- Verification results: `pnpm -F @ludoforge/engine build`, `node --test packages/engine/dist/test/integration/fitl-events-pathet-lao.test.js`, `pnpm -F @ludoforge/engine test`, `pnpm turbo lint`, and `pnpm run check:ticket-deps` all passed.
