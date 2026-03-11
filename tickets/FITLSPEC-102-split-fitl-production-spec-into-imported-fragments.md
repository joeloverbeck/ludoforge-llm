# FITLSPEC-102: Split FITL production GameSpec into imported fragments

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — production-spec helper usage and fragment-aware compile path; no runtime semantics changes
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-101-gamespec-fragment-entrypoints.md`, `data/games/fire-in-the-lake/00-metadata.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/test/helpers/production-spec-helpers.ts`

## Problem

FITL production content is still authored as a flat directory of monolithic markdown sections, with the event deck concentrated in an oversized file. Even after the loader is fixed to support composed entrypoints canonically, FITL still needs to be reorganized into stable fragments so content growth remains manageable, reviewable, and mechanically safe as the remaining event cards are implemented.

## Assumption Reassessment (2026-03-11)

1. FITL already uses a directory under `data/games/fire-in-the-lake`, but the large event content is still concentrated in `41-content-event-decks.md`.
2. The event deck is the dominant growth vector; more than half of FITL event cards remain to be implemented, so the current file structure will continue to degrade maintainability even if parser ceilings are lifted or bypassed.
3. The correct fix is structural fragmentation of `GameSpecDoc` source files, not inventing a separate non-GameSpec event format and not pushing more semantics into engine code.

## Architecture Check

1. Splitting FITL into imported fragments is cleaner than a single mega-file because it localizes ownership, review scope, and failure domains while preserving one canonical data model.
2. All game-specific behavior remains in FITL `GameSpecDoc` fragments; `GameDef` generation and simulation stay agnostic.
3. No backwards-compatibility shims should preserve the old monolithic FITL event file layout. Once the fragment structure lands, production helpers and tests should treat it as canonical.

## What to Change

### 1. Introduce a FITL entrypoint fragment

Create a root entrypoint markdown file for FITL that declares `imports:` for the game’s major sections and becomes the canonical production source path used by helpers/tests.

### 2. Split event content into stable imported fragments

Break `41-content-event-decks.md` into smaller imported files organized by stable authoring boundaries, such as:
- period/year buckets
- numbered card ranges
- tutorial vs full-deck sections

The split must keep deterministic ordering and preserve exact compiled `GameSpecDoc` semantics.

### 3. Rebalance oversized sections where useful

If other FITL sections are approaching poor maintainability, split them during the migration where that materially improves clarity. Keep splits domain-oriented rather than arbitrary.

### 4. Update FITL production helper expectations

Point FITL production helpers/tests at the new FITL entrypoint file and remove assumptions that reading the directory directly yields the canonical source text.

## Files to Touch

- `data/games/fire-in-the-lake/` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (delete or replace)
- `data/games/fire-in-the-lake/41-events/` (new)
- `data/games/fire-in-the-lake/<entrypoint-file>.md` (new)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- FITL production integration tests under `packages/engine/test/integration/` (modify)

## Out of Scope

- Rewriting FITL event semantics beyond preserving current behavior
- Altering `visual-config.yaml`
- Creating new non-GameSpec event asset formats
- Reorganizing non-FITL games unless required by shared entrypoint changes

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles from a root entrypoint fragment using imports, with identical gameplay semantics to the pre-split content.
2. FITL event content is no longer concentrated in a single oversized monolithic event-deck file.
3. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. FITL rule/event content remains entirely in `GameSpecDoc` markdown fragments; no FITL-specific behavior is added to agnostic engine layers.
2. Fragment ordering and imports remain deterministic so repeated compiles yield identical `GameDef` output for the same content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/helpers/production-spec-helpers.ts` — verify FITL production source resolves from the new entrypoint.
2. `packages/engine/test/integration/fitl-events-full-deck.test.ts` — verify full deck still compiles and enumerates correctly after fragmentation.
3. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — verify FITL production entrypoint parses/validates/compiles cleanly via imports.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-full-deck.test.js`
3. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm run check:ticket-deps`
