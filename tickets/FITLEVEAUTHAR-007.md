# FITLEVEAUTHAR-007: Audit and migrate remaining FITL event cards onto replacement/routing macros

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — FITL game data and tests only
**Deps**: FITLEVEAUTHAR-002, FITLEVEAUTHAR-003, FITLEVEAUTHAR-004

## Problem

The current ticket series creates the cookbook, introduces reusable FITL-local replacement/routing macros, and proves them on CIDG. That is necessary but not sufficient.

Multiple event cards across the production FITL data still contain open-coded replacement, routing, posture-setting, and terrain/country-filtering sequences that are architecturally the same class of debt as CIDG. If that debt remains unowned, the codebase keeps the worst part of both architectures:

- macros exist, but authors still have to rediscover and duplicate low-level sequences
- one exemplar card is clean, while similar cards drift apart
- future fixes must be repeated across card-specific YAML instead of landing once in the macro layer

This ticket owns the remaining migration backlog so the macro architecture actually becomes the dominant authoring path rather than a one-card exception.

## Assumption Reassessment (2026-03-13)

1. `FITLEVEAUTHAR-002` is intended to introduce reusable replacement/routing macros, and `FITLEVEAUTHAR-004` is explicitly limited to CIDG — confirmed.
2. No other active ticket in `tickets/` currently owns the broader post-CIDG migration of similar event cards onto those macros — confirmed by grep across the active ticket set.
3. Production event files outside CIDG still contain repeated explicit routing to `available-*` boxes, repeated posture-setting via `setTokenProp`, and repeated terrain/country-filter patterns that should be reviewed for macro adoption — confirmed by scanning the `41-events/*.md` files.
4. The right architectural boundary remains unchanged: consolidate recurring FITL authoring patterns in FITL-local macros and tests, not in the engine/runtime/kernel — confirmed.

## Architecture Check

1. This migration is beneficial to the long-term architecture because it reduces repeated YAML behavior without moving game-specific rules into shared engine code.
2. The migration should be selective, not mechanical: only patterns that genuinely match the new macro contracts should be rewritten.
3. No backwards-compatibility aliases should be introduced. Cards should be rewritten in place to the canonical macro-based shape.
4. The shared event-fidelity helpers from `FITLEVEAUTHAR-003` should be used to strengthen coverage when a migrated card exposes replacement/routing invariants that were previously under-tested.

## What to Change

### 1. Audit remaining event cards for macro-fit candidates

Review the production FITL event files and identify cards that still open-code the same recurring patterns that `FITLEVEAUTHAR-002` introduces:

- faction-aware routing of removed pieces
- piece replacement from Available pools
- replacement plus posture assignment
- terrain/country filtering paired with occupant predicates
- depletion/no-op fallback around replacement flows

Create a concrete candidate list inside this ticket before migration begins.

### 2. Migrate cards that cleanly fit the new macro contracts

For each candidate card that genuinely matches the macro abstractions:

- replace the open-coded sequence with the new macro calls
- preserve compiled behavior exactly unless a rules-verified bug is found
- keep card-specific logic in the card and shared mechanics in the macros

Do not force a macro onto a card if doing so obscures the rule or requires card-specific branching inside the macro.

### 3. Strengthen per-card fidelity coverage where needed

For each migrated card, verify at least the relevant invariants:

- exact event text
- compiled structural contract
- deterministic execution under controlled decisions
- correct routing destination
- correct posture assignment
- depletion/fallback behavior
- legal no-op behavior when applicable

Prefer the shared FITL event fidelity helpers from `FITLEVEAUTHAR-003` instead of per-test boilerplate.

### 4. Record residual non-migrated cards explicitly

If any remaining cards still cannot or should not use the new macros cleanly, document them in this ticket's final `Outcome` with the reason:

- pattern not actually shared
- macro surface still insufficient
- rule wording too idiosyncratic for safe abstraction

If the audit exposes another recurring pattern that deserves a new macro, stop and raise that as a follow-up rather than silently open-coding more debt.

## Files to Touch

- targeted FITL event files under `data/games/fire-in-the-lake/41-events/` (modify only candidate cards that cleanly fit)
- targeted FITL integration tests under `packages/engine/test/integration/` for migrated cards
- this ticket file (update candidate list, completion status, and final outcome)

## Out of Scope

- Modifying engine source code (compiler, kernel, agents, sim).
- Reworking cards whose logic does not actually match the new macro contracts.
- Introducing compatibility aliases for old authoring patterns.
- Changing Spec 29 archival or repo-guidance references.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo lint`

### Invariants

1. No engine source files are modified.
2. Every migrated card uses the new macros only where the abstraction is genuinely correct.
3. Every migrated card preserves behavior unless a rules-verified bug is explicitly called out.
4. Each migrated card has test coverage for any replacement/routing/posture/fallback invariant that could regress.
5. Residual non-migrated debt is explicitly documented rather than left implicit.

## Test Plan

### New/Modified Tests

1. Targeted existing or new integration tests for each migrated card, covering routing/replacement/posture/fallback behavior as applicable.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo lint`
