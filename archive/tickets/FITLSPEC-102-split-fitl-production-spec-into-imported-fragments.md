# FITLSPEC-102: Split FITL production GameSpec into imported fragments

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic GameSpec composition must support composing one event deck across imported fragments; production FITL parse helpers/tests should stop depending on directory concatenation
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-101-gamespec-fragment-entrypoints.md`, `data/games/fire-in-the-lake.game-spec.md`, `data/games/fire-in-the-lake/00-metadata.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/src/cnl/compose-gamespec.ts`, `packages/engine/test/helpers/production-spec-helpers.ts`

## Problem

FITL production content is still authored as a flat directory of monolithic markdown sections, with the event deck concentrated in an oversized file. Even after the loader is fixed to support composed entrypoints canonically, FITL still needs to be reorganized into stable fragments so content growth remains manageable, reviewable, and mechanically safe as the remaining event cards are implemented.

## Assumption Reassessment (2026-03-11)

1. FITL already has a canonical root entrypoint at `data/games/fire-in-the-lake.game-spec.md`, and production compilation helpers already use that entrypoint. The ticket must not claim that FITL still lacks an entrypoint.
2. The oversized content problem is real, but it is now narrower: `41-content-event-decks.md` remains monolithic even though the higher-level production entrypoint migration is already complete.
3. The current composition layer can concatenate top-level `eventDecks` arrays, but it cannot compose one logical event deck by appending `cards` across multiple imported fragments with the same deck id. Without that capability, the proposed FITL split is not actually implementable.
4. The correct fix is still structural fragmentation of `GameSpecDoc` source files, not inventing a separate non-GameSpec event format and not pushing FITL-specific semantics into engine/runtime code.

## Architecture Check

1. Splitting FITL event content into imported fragments is cleaner than a single mega-file because it localizes ownership, review scope, and failure domains while preserving one canonical data model.
2. The engine change required here must stay generic: compose imported event-deck fragments by deck id and append cards deterministically, rather than adding FITL-specific loader behavior.
3. All game-specific behavior remains in FITL `GameSpecDoc` fragments; `GameDef` generation and simulation stay agnostic.
4. No backwards-compatibility shims should preserve FITL-specific directory concatenation as a canonical test path. Once the fragment structure lands, FITL helpers/tests should treat entrypoint-based composition as canonical.

## What to Change

### 1. Add generic composed event-deck fragment support

Extend `composeGameSpec()` so imported fragments can contribute cards to the same logical event deck without producing duplicate deck definitions. The merge must:
- remain game-agnostic
- preserve deterministic import order
- keep source-map paths stable and attributable at card-level
- continue surfacing duplicate deck/card/order diagnostics correctly

### 2. Split FITL event content into stable imported fragments

Replace the monolithic `41-content-event-decks.md` body with an import-rooted event-deck entrypoint and move the actual deck content into smaller imported files organized by stable authoring boundaries, such as:
- period/year buckets
- numbered card ranges
- tutorial vs full-deck sections

The split must keep deterministic ordering and preserve exact compiled `GameSpecDoc` semantics.

### 3. Finish the canonical FITL helper/test loading path

Update FITL production helpers/tests that still read raw directory-concatenated markdown so they load FITL through the canonical entrypoint-based composition path instead.

### 4. Rebalance oversized sections where useful

If other FITL sections are approaching poor maintainability, split them during the migration where that materially improves clarity. Keep splits domain-oriented rather than arbitrary.

## Files to Touch

- `packages/engine/src/cnl/compose-gamespec.ts` (modify)
- `packages/engine/test/unit/compose-gamespec.test.ts` (modify)
- `data/games/fire-in-the-lake.game-spec.md` (likely unchanged; verify imports remain canonical)
- `data/games/fire-in-the-lake/` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (replace with fragment entrypoint)
- `data/games/fire-in-the-lake/41-events/` (new)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- FITL production integration tests under `packages/engine/test/integration/` (modify)

## Out of Scope

- Rewriting FITL event semantics beyond preserving current behavior
- Altering `visual-config.yaml`
- Creating new non-GameSpec event asset formats
- Reorganizing non-FITL games unless required by shared entrypoint changes

## Acceptance Criteria

### Tests That Must Pass

1. FITL composes and compiles through the existing root entrypoint at `data/games/fire-in-the-lake.game-spec.md`, with identical gameplay semantics to the pre-split content.
2. `composeGameSpec()` can generically compose one logical event deck from multiple imported fragments without duplicate-deck regressions.
3. FITL event content is no longer concentrated in a single oversized monolithic event-deck file.
4. FITL helper/test loading no longer treats directory concatenation as the canonical parse path.
5. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. FITL rule/event content remains entirely in `GameSpecDoc` markdown fragments; no FITL-specific behavior is added to agnostic engine layers.
2. Fragment ordering and imports remain deterministic so repeated compiles yield identical `GameDef` output for the same content.
3. Imported partial event-deck composition is keyed by generic event-deck identity, not by FITL-specific filenames or card ranges.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compose-gamespec.test.ts` — verify imported fragments can append cards into one logical event deck deterministically and preserve source-map ownership.
2. `packages/engine/test/helpers/production-spec-helpers.ts` and affected FITL integration tests — verify FITL parse/compile helpers resolve from the canonical entrypoint-based composition path rather than directory concatenation.
3. `packages/engine/test/integration/fitl-events-full-deck.test.ts` — verify the full deck still compiles, enumerates, and orders correctly after fragmentation.
4. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — verify FITL production entrypoint parses/validates/compiles cleanly via imports.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compose-gamespec.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-full-deck.test.js`
4. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
5. `pnpm -F @ludoforge/engine test:integration`
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-11
- Actual changes:
  - Added generic `composeGameSpec()` support for composing one logical event deck across multiple imported fragments by normalized deck id, while appending cards deterministically and preserving card-level source-map ownership.
  - Replaced `data/games/fire-in-the-lake/41-content-event-decks.md` with an import-rooted entrypoint and split FITL event content into `data/games/fire-in-the-lake/41-events/001-032.md`, `033-064.md`, `065-096.md`, and `097-130.md`.
  - Switched FITL parse-level production tests away from directory-concatenated markdown and onto canonical entrypoint-based parsed loading via `parseProductionSpec()`.
  - Strengthened compose and FITL full-deck regression coverage to assert one composed FITL event deck with 130 cards after fragmentation.
  - Fixed a few unrelated engine hygiene issues encountered during required verification so `build`, `lint`, and `test:integration` could complete on the current tree: readonly parse-option omission in `staged-pipeline.ts`, an incorrect import in `compile-effects-free-op.ts`, and several lint-blocking unused imports in effect compiler modules.
- Deviations from original plan:
  - The ticket originally assumed FITL still needed a new top-level entrypoint. That was already done; the implementation instead completed the missing generic deck-fragment composition capability and removed the remaining legacy FITL test helper path.
  - FITL event fragments were split into stable numeric card ranges rather than period-named files because range-based authoring boundaries map directly to deterministic deck identity/order and avoided introducing additional semantic categorization rules.
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/compose-gamespec.test.js packages/engine/dist/test/integration/fitl-events-full-deck.test.js packages/engine/dist/test/integration/parse-validate-full-spec.test.js` ✅
  - `pnpm -F @ludoforge/engine test:integration` ✅
  - `pnpm -F @ludoforge/engine lint` ✅ (warnings only, exit 0)
  - `pnpm run check:ticket-deps` ✅
