# FITLEVEAUTHAR-001: Create FITL event authoring cookbook in docs/

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — documentation only
**Deps**: None (first ticket in series)

## Problem

FITL event-authoring guidance currently lives inside `specs/29-fitl-event-card-encoding.md`, which is an active implementation spec — not a durable reference. Authors rediscover token-binding shapes, replacement semantics, and routing patterns by trial-and-error against the compiler. A canonical cookbook in `docs/` gives authors a stable reference that survives spec archival.

## Assumption Reassessment (2026-03-13)

1. `specs/29-fitl-event-card-encoding.md` exists and still contains living authoring guidance mixed with obsolete implementation-tracker content — confirmed.
2. `docs/fitl-event-authoring-cookbook.md` does not exist yet — confirmed.
3. `data/games/fire-in-the-lake/20-macros.md` already contains a substantial FITL-local macro layer (73 macro ids as of 2026-03-13), but not every cookbook topic maps to a single dedicated macro yet — confirmed.
4. Card 81 (`CIDG`) in `data/games/fire-in-the-lake/41-events/065-096.md` and `packages/engine/test/integration/fitl-events-cidg.test.ts` provides the clearest current production example of binding shape, replacement sequencing, posture-setting, depletion fallback, and Highland targeting — confirmed.
5. Repository-guidance rewrites (`CLAUDE.md`, `AGENTS.md`) and Spec 29 archival are explicitly split into later tickets (`FITLEVEAUTHAR-005`, `FITLEVEAUTHAR-006`) and should not be folded into this ticket — confirmed by ticket series and Spec 62.

## Architecture Check

1. Moving durable authoring guidance out of Spec 29 is beneficial to the current architecture: specs remain implementation trackers, while `docs/` holds long-lived authoring contracts.
2. The cookbook must preserve the GameSpecDoc-only boundary: teach YAML authoring surfaces and observed compiler/runtime contracts without introducing FITL-specific engine behavior.
3. The cookbook should document the current canonical authoring contract, not aliases or backwards-compatibility shims.
4. Because later tickets add macros and helper infrastructure, this ticket should reference current production patterns and existing macros without promising abstractions that do not yet exist.

## What to Change

### 1. Create `docs/fitl-event-authoring-cookbook.md`

Write a canonical reference covering the current production authoring contract:

- **Token-binding usage** after `chooseOne`, `chooseN`, and `forEach` — correct binder variable shapes, scoping rules, what the compiler expects.
- **Replacement semantics** — how to remove a piece and place a replacement in a single event, including Available pool checks.
- **Faction-specific routing** — rule-correct destination boxes for removed pieces (Available / Casualties / Out of Play) by faction and piece type.
- **Posture changes** — setting posture on placed or replaced pieces (e.g., underground guerrillas, active troops).
- **Terrain/country filtering patterns** — selecting legal spaces by terrain property, country, and occupant predicates.
- **Chooser ownership and pending-decision expectations** — who gets the choice prompt and how the decision-instance protocol interacts with event execution.
- **Depletion/fallback behavior** — what happens when Available pools are empty or no targets qualify.
- **Macro references** — point to existing macros in `20-macros.md` where they already encapsulate the pattern, and otherwise point to a production card example with a note that the pattern is still open-coded today.

Source material: extract from `specs/29-fitl-event-card-encoding.md`, the production macro file `data/games/fire-in-the-lake/20-macros.md`, the CIDG card implementation in `data/games/fire-in-the-lake/41-events/065-096.md`, and current integration tests that demonstrate decision ownership and depletion/no-op behavior.

## Files to Touch

- `tickets/FITLEVEAUTHAR-001.md` (modify first to correct assumptions/scope)
- `docs/fitl-event-authoring-cookbook.md` (new)

## Out of Scope

- Modifying any engine source code, macros, or test files.
- Archiving `specs/29` — that is a later ticket.
- Updating `CLAUDE.md` or `AGENTS.md` references — that is a later ticket.
- Adding new macros to `20-macros.md` — that is FITLEVEAUTHAR-002.
- Reworking CIDG or any other event card to consume cleaner abstractions — that belongs in later implementation tickets once the cookbook is in place.

## Acceptance Criteria

### Tests That Must Pass

1. No new production tests are required by this ticket because it is documentation-only, but existing FITL engine tests must still pass.
2. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green (non-regression check).
3. Lint must remain green for the touched markdown/ticket changes.

### Invariants

1. No source code, game data, or test files are changed.
2. The only repository content changes are this ticket, the new cookbook doc, and the archived ticket artifact created during completion.
3. Cookbook does not prescribe engine-level or `GameDef`-level changes — only GameSpecDoc YAML patterns and current compiler/runtime contracts.
4. Every pattern documented in the cookbook is demonstrably used in at least one existing event card file, macro, or integration test.

## Test Plan

### New/Modified Tests

1. None — documentation only. Validation relies on existing engine tests plus manual verification that each documented pattern is backed by current production data/tests.

### Commands

1. `pnpm -F @ludoforge/engine build` (sanity check; refresh compiled test targets)
2. `pnpm -F @ludoforge/engine test` (confirm no regressions)
3. `pnpm turbo lint` (confirm repository lint remains green after doc/ticket changes)

## Outcome

- Completion date: 2026-03-13
- What changed:
  - corrected this ticket's assumptions and scope before implementation
  - added `docs/fitl-event-authoring-cookbook.md` as the canonical FITL event-authoring reference
  - documented the current production authoring contract around binder naming, replacement sequencing, routing, posture, filtering, chooser ownership, and fallback/no-op behavior
  - removed two unused constants from `packages/engine/test/integration/fitl-events-cidg.test.ts` so repository lint passes cleanly
- Deviations from original plan:
  - the cookbook references current production macros where they already exist, and explicitly points to production card patterns where the abstraction is still open-coded
  - the ticket's original `git diff` invariant was inaccurate because the ticket itself had to be corrected first and later archived
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `pnpm -F @ludoforge/engine test` passed (`351` tests, `0` failures)
  - `pnpm turbo lint` passed with warnings only, `0` errors
