# FITLEVECARENC-021: Rework Chou En Lai to Use Canonical Stochastic Decision Resolution

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — depends on FITLEVENTARCH-003; FITL data/tests cleanup
**Deps**: tickets/FITLEVENTARCH-003-rollrandom-decision-discovery-soundness.md, specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

Current `card-42` integration coverage uses a workaround to complete unshaded execution by parsing runtime error text to extract a missing decision ID and replaying the move with injected params. This is brittle and should be removed once stochastic decision discovery is fixed.

`Chou En Lai` must rely on canonical engine decision resolution behavior instead of runtime-error-string extraction.

## Assumption Reassessment (2026-03-07)

1. `card-42` event data now correctly encodes unshaded/shaded rules text and effects in `data/games/fire-in-the-lake/41-content-event-decks.md`.
2. `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` currently includes runtime-error parsing to derive the missing chooser decision ID for unshaded removal selection.
3. That workaround is only needed because decision probing for `rollRandom`-gated choices is currently unsound (addressed by FITLEVENTARCH-003).

## Architecture Check

1. Test logic should validate game rules, not compensate for engine discovery gaps via message parsing.
2. This ticket keeps layering clean: FITL card data remains declarative; generic decision resolution stays in engine.
3. No compatibility shims: remove workaround and assert one canonical completion path through decision-sequence APIs.

## What to Change

### 1. Remove Chou En Lai runtime-error parsing workaround

After FITLEVENTARCH-003 lands, refactor `fitl-events-chou-en-lai.test.ts` to use canonical decision-sequence resolution utilities (no regex extraction from thrown messages).

### 2. Tighten Chou En Lai unshaded assertions around required choice ownership

Assert that unshaded path surfaces pending choice for NVA-owned troop-removal selection and can be completed through normal decision fill flow.

### 3. Keep card content unchanged unless required by canonical engine contracts

Do not alter gameplay intent or text. Any data edits must be strictly representational and justified by canonical engine contract adoption.

## Files to Touch

- `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-nva.test.ts` (modify, if contract assertions need updates)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify only if canonical migration requires shape adjustment)

## Out of Scope

- New gameplay changes to `card-42`
- Unrelated event card migrations
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. `card-42` unshaded test flow completes through standard decision-sequence APIs with no runtime-error-string parsing.
2. `card-42` shaded/unshaded runtime behavior and clamps remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL card data expresses rule intent only; no engine-gap workaround logic is embedded in card tests.
2. Game-agnostic decision-sequence semantics are reused directly by FITL tests.

## Tests

1. Update Chou En Lai integration test to assert canonical pending choice + resolved execution path.
2. Re-run 1968 NVA card-contract tests to guard card metadata/effect shape invariants.
3. Re-run full deck regression to ensure no card-flow drift.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` — remove workaround and assert canonical stochastic decision resolution.
2. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — ensure card-42 contract assertions remain aligned.
3. `packages/engine/test/integration/fitl-events-full-deck.test.ts` — regression guard.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-chou-en-lai.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-full-deck.test.js`
5. `pnpm -F @ludoforge/engine test`
