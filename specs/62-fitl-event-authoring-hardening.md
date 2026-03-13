# Spec 62 — FITL Event Authoring Hardening

**Status**: Proposed
**Priority**: High
**Complexity**: Medium
**Dependencies**: engine CNL compiler diagnostics, `data/games/fire-in-the-lake/20-macros.md`, Fire in the Lake event integration tests

## Overview

Fire in the Lake event encoding is functionally viable, but authoring remains too error-prone for complex cards. Card 81 (`CIDG`) exposed that the engine/runtime already has enough generic capability, yet authors still have to rediscover:

- the exact canonical binder/token surface for token-consuming effects,
- the correct low-level replacement/removal/routing patterns,
- and the minimum test bundle needed to prove tricky card fidelity.

This spec hardens the event-authoring workflow without moving game-specific behavior into `GameDef` or simulation.

## Goals

1. Keep all Fire in the Lake behavior in `GameSpecDoc` and FITL data/macros.
2. Keep compiler/runtime/kernel generic.
3. Make complex event authoring cleaner, more robust, and more extensible.
4. Reduce repeated low-level YAML patterns in event cards.
5. Standardize behavioral testing for event cards with randomness, replacement, routing, or posture changes.

## Non-Goals

1. No FITL-specific branches in the compiler, kernel, or simulator.
2. No backwards-compatibility aliases for older event-authoring shapes.
3. No visual-presentation changes in `visual-config.yaml`.

## Problem Statement

The current architecture is close to correct, but the authoring layer is still underspecified in practice:

1. Authors can use intuitive but unsupported token-reference shapes and only discover the correct form after compiler iteration.
2. Reusable FITL event patterns are still encoded too often as open-coded effect sequences instead of macro-level verbs.
3. Event fidelity tests are not yet standardized enough to catch subtle rule drift early.
4. `specs/29-fitl-event-card-encoding.md` is an implementation holdout from the failed “encode everything at once” push and should not remain the long-term home for an event-authoring cookbook.

## Architecture Direction

### 1. Move cookbook guidance out of `specs/29-fitl-event-card-encoding.md`

Create a dedicated cookbook in `docs/` for Fire in the Lake event authoring patterns. That cookbook should become the canonical guidance for:

- token-binding usage after `chooseOne`, `chooseN`, and `forEach`
- replacement semantics
- faction-specific routing to Available / Casualties / Out of Play
- posture changes on placed or replaced pieces
- terrain/country filtering patterns
- chooser ownership and pending-decision expectations

`specs/29-fitl-event-card-encoding.md` should be archived after its living guidance is migrated or superseded.

### 2. Expand FITL macros instead of adding FITL engine primitives

Extend `data/games/fire-in-the-lake/20-macros.md` with reusable event-authoring helpers for recurring patterns such as:

- remove selected pieces to rule-correct destination boxes
- replace selected pieces from one or more Available pools
- route removed pieces by faction/type
- place replacements and set required token posture
- select legal spaces by terrain/property plus occupant predicates

These macros must stay FITL-local unless a pattern later proves useful across multiple games.

### 3. Add standard event fidelity infrastructure

Create reusable test helpers for Fire in the Lake event cards so complex cards consistently verify:

- exact event text
- compiled structural contract
- deterministic execution under controlled choices / RNG
- depletion / fallback behavior
- no-op behavior when the card is legal but has no eligible target

This infrastructure should make it cheap to add strong coverage per card and expose behavioral regressions faster.

## CIDG Follow-Up

Card 81 is correctly implemented today, but it should be revisited once the new macro/test infrastructure exists.

Rework target:

1. Re-express `CIDG` using any new canonical FITL macros introduced by this spec if that reduces open-coded replacement/routing logic.
2. Re-home its tests onto the new shared event-fidelity helpers once those helpers exist.
3. Preserve existing behavior exactly unless the rules reference proves a mistake in the current implementation.

## Files To Create Or Change

### New

- `docs/fitl-event-authoring-cookbook.md`
- shared FITL event test helper files under `packages/engine/test/helpers/`

### Modify

- `data/games/fire-in-the-lake/20-macros.md`
- targeted FITL event test files that should migrate to the new helper pattern
- repository guidance documents such as `AGENTS.md` and `CLAUDE.md` so they point to the cookbook rather than to `specs/29-fitl-event-card-encoding.md`

### Archive

- `specs/29-fitl-event-card-encoding.md` once its still-useful guidance has been migrated or explicitly replaced

## Acceptance Criteria

1. A cookbook in `docs/` defines the canonical FITL event-authoring patterns.
2. `AGENTS.md` and `CLAUDE.md` reference the cookbook and no longer treat Spec 29 as the living authoring guide.
3. FITL macros cover the recurring replacement/routing patterns that currently require verbose open-coded event logic.
4. Shared FITL event test helpers exist and are used by at least one migrated complex event card.
5. `CIDG` is reviewed for rework onto the new macro/test infrastructure after that infrastructure lands.
6. No FITL-specific runtime or `GameDef` behavior is introduced.

## Verification

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. Any migrated event-card integration suites pass with the new shared helper layer.

## Notes

The immediate compiler-diagnostic hardening can proceed independently. This spec is for the larger authoring, macro, documentation, and test-infrastructure cleanup that should prevent CIDG-class friction from recurring on later cards.
