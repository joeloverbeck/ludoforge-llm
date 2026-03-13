# FITLEVEAUTHAR-001: Create FITL event authoring cookbook in docs/

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — documentation only
**Deps**: None (first ticket in series)

## Problem

FITL event-authoring guidance currently lives inside `specs/29-fitl-event-card-encoding.md`, which is an active implementation spec — not a durable reference. Authors rediscover token-binding shapes, replacement semantics, and routing patterns by trial-and-error against the compiler. A canonical cookbook in `docs/` gives authors a stable reference that survives spec archival.

## Assumption Reassessment (2026-03-13)

1. `specs/29-fitl-event-card-encoding.md` exists and contains living guidance mixed with implementation tracking — confirmed.
2. No `docs/fitl-event-authoring-cookbook.md` currently exists — confirmed.
3. Existing macros in `data/games/fire-in-the-lake/20-macros.md` (74 macros) provide patterns that the cookbook should reference — confirmed.

## Architecture Check

1. Cookbook is pure documentation — no code changes, no risk of regressions.
2. Preserves GameSpecDoc-only boundary: cookbook teaches YAML authoring, not engine internals.
3. No backwards-compatibility shims introduced.

## What to Change

### 1. Create `docs/fitl-event-authoring-cookbook.md`

Write a canonical reference covering:

- **Token-binding usage** after `chooseOne`, `chooseN`, and `forEach` — correct binder variable shapes, scoping rules, what the compiler expects.
- **Replacement semantics** — how to remove a piece and place a replacement in a single event, including Available pool checks.
- **Faction-specific routing** — rule-correct destination boxes for removed pieces (Available / Casualties / Out of Play) by faction and piece type.
- **Posture changes** — setting posture on placed or replaced pieces (e.g., underground guerrillas, active troops).
- **Terrain/country filtering patterns** — selecting legal spaces by terrain property, country, and occupant predicates.
- **Chooser ownership and pending-decision expectations** — who gets the choice prompt and how the decision-instance protocol interacts with event execution.
- **Depletion/fallback behavior** — what happens when Available pools are empty or no targets qualify.
- **Macro references** — point to existing macros in `20-macros.md` for each pattern, with "use this macro instead of open-coding" guidance.

Source material: extract from `specs/29-fitl-event-card-encoding.md`, the CIDG card implementation in `data/games/fire-in-the-lake/41-events/065-096.md`, and patterns visible across existing event card files.

## Files to Touch

- `docs/fitl-event-authoring-cookbook.md` (new)

## Out of Scope

- Modifying any engine source code, macros, or test files.
- Archiving `specs/29` — that is a later ticket.
- Updating `CLAUDE.md` or `AGENTS.md` references — that is a later ticket.
- Adding new macros to `20-macros.md` — that is FITLEVEAUTHAR-002.

## Acceptance Criteria

### Tests That Must Pass

1. No tests are added or modified by this ticket (doc-only).
2. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green (no regressions from doc-only change).

### Invariants

1. No source code is changed — `git diff --stat` shows only the new `.md` file.
2. Cookbook does not prescribe engine-level or `GameDef`-level changes — only GameSpecDoc YAML patterns.
3. Every pattern documented in the cookbook is demonstrably used in at least one existing event card file.

## Test Plan

### New/Modified Tests

1. None — documentation only.

### Commands

1. `pnpm -F @ludoforge/engine build` (sanity check — no source changed)
2. `pnpm -F @ludoforge/engine test` (confirm no regressions)
