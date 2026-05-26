# 198GAMECONFCORP-001: Author minimal perfect-info board game data spec

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data-asset authoring only
**Deps**: `specs/198-cross-game-conformance-corpus-and-observer-safety-proofs.md`

## Problem

Foundation #16 mandates a conformance corpus spanning materially different game families — perfect-information board, hidden-information card, stochastic, and asymmetric or phase-heavy. Today `data/games/` contains FITL (asymmetric phase-heavy) and Texas Hold'em (hidden + stochastic) only. The perfect-information board game axis is missing, which blocks the cross-family architectural-invariant test surface (ticket 002) and the observer-safety invariant proofs (ticket 003 — both require a clean public-observability game as a fixture or fixture-variant source). This ticket authors that missing corpus game.

## Assumption Reassessment (2026-05-26)

1. `data/games/` contains exactly two directories: `fire-in-the-lake/` and `texas-holdem/`. No third game directory exists. Verified via `ls data/games/`.
2. GameSpecDoc convention is a multi-markdown-file structure with fenced YAML — confirmed by inspecting both existing games. Texas Hold'em uses the smaller file set: `00-metadata.md`, `05-verbalization.md`, `10-vocabulary.md`, `20-macros.md`, `30-rules-actions.md`, `40-content-data-assets.md`, `90-terminal.md`, `92-agents.md`, `93-observability.md`, `visual-config.yaml`. This is the appropriate template for a minimal new corpus game.
3. Spec §4.1 enumerates three candidate game shapes (Generic Race, Generic Capture, Generic Control). The implementation must present these to the user for selection before authoring, per spec §6 edge case (`the implementation runs the spec by the user before committing the final game choice`).
4. Spec §2 marks `visual-config.yaml` as not required — the corpus axis is engine-side conformance, not runner integration.
5. Boundary reset approved 2026-05-26: the user confirmed the Foundations-aligned recommendation to author **Generic Control** as a minimal two-player public-observability control game. The approved constraint is data-only authoring with no new engine primitives; if the live DSL cannot express the minimal control game, implementation must stop and narrow rather than add engine code in this ticket.

## Architecture Check

1. Generic spec — no game-specific engine logic introduced (Foundation #1). All rule-authoritative data lives in GameSpecDoc YAML (Foundation #2).
2. **Public observability** is the defining axis. No hidden zones, no private decks, no per-seat hand visibility. This distinguishes the new corpus game from Texas Hold'em (the hidden-info axis) and from FITL (asymmetric with hidden information).
3. Bounded turns and deterministic terminal condition (Foundations #8, #10) — the game must terminate within a known turn budget for use as a fuzz target in ticket 002.
4. No per-game schema files added (Foundation #6).

## What to Change

### 1. Confirm game shape with user

Present the three spec §4.1 candidate shapes:

- **Generic Race** — 2-player zone-graph race-to-target with `move(token, adjacentZone)` actions; terminal when one player's token reaches the designated target zone.
- **Generic Capture** — 2-player capture-on-overlap; terminal when one player has zero tokens.
- **Generic Control** — 2-player control-majority with placement + movement; terminal when a chosen zone-set is uniformly controlled.

Selection criterion (per spec §4.1): the spec whose minimal authoring covers the largest fraction of the agent layer's surfaces — selectors, role constraints, posture, plan templates with composed turns. Recommend whichever candidate maximizes that coverage; defer to user choice.

Implementation decision: **Generic Control** selected by user confirmation on 2026-05-26 after reassessment against `docs/FOUNDATIONS.md`.

### 2. Author `data/games/<chosen-name>/` following the Texas Hold'em file layout

The Texas Hold'em layout is the minimal example to follow. Author these files in fenced-YAML markdown form, following the spec §4.1 author conventions (`dataAssets` for any auxiliary game data; no hidden information; one or two minimal agent profiles):

- `00-metadata.md` — game name, version, players count (2)
- `05-verbalization.md` — vocabulary for verbalizing actions (minimal — the corpus axis does not require runner-facing verbalization)
- `10-vocabulary.md` — DSL vocabulary for the game's actions and effects
- `20-macros.md` — macros (likely none; include the file as a placeholder if the convention requires it)
- `30-rules-actions.md` — legal actions and effects
- `40-content-data-assets.md` — board zones (with `adjacentTo`), token types, terminal-condition data
- `90-terminal.md` — terminal condition
- `92-agents.md` — one minimal agent profile (random or near-random; the corpus axis is not about competitive quality)
- `93-observability.md` — public observability declaration (all zones visible to all seats; no hidden state)

Optional: omit `visual-config.yaml` entirely, since spec §2 marks runner integration out of scope.

### 3. Author one fixture game that plays to terminal

Add a fixture file (path follows the existing engine fixture convention — likely under `packages/engine/test/fixtures/` or `data/games/<chosen-name>/fixtures/` depending on convention used by FITL/THX) that pins a seeded random-agent play-through to terminal. The fixture serves as a determinism witness for ticket 002.

### 4. Verify build-twice byte-identity

Run `pnpm turbo build` twice and compare the compiled GameDef for the new game. Byte-identical output is the determinism acceptance criterion (Foundations #8, #16).

## Files to Touch

Likely surface — exact directory name (`<chosen-name>`) deferred to user selection in §1:

- `data/games/<chosen-name>/00-metadata.md` (new)
- `data/games/<chosen-name>/05-verbalization.md` (new)
- `data/games/<chosen-name>/10-vocabulary.md` (new)
- `data/games/<chosen-name>/20-macros.md` (new — placeholder ok)
- `data/games/<chosen-name>/30-rules-actions.md` (new)
- `data/games/<chosen-name>/40-content-data-assets.md` (new)
- `data/games/<chosen-name>/90-terminal.md` (new)
- `data/games/<chosen-name>/92-agents.md` (new)
- `data/games/<chosen-name>/93-observability.md` (new)
- One fixture file pinning a seeded random-agent play-through to terminal (path follows the existing fixture convention — confirm against `packages/engine/test/fixtures/` and the existing FITL/THX fixtures at implementation start).

## Out of Scope

- Hidden information in any form — this is the public-observability axis (spec §4.1 author convention).
- Competitive agent tuning to win the game — Foundation #16 corpus is about architectural agnosticism, not competitive quality (spec §2 non-goal).
- `visual-config.yaml` and runner integration (spec §2 non-goal).
- Engine primitives the candidate game might want but does not have — if discovered, defer to a follow-on spec named in spec §11; do not add engine code in this ticket.
- Cross-family invariant tests (ticket 002).
- Observer-safety invariant proofs (ticket 003) — including the synthesized hidden-info fixture variant of this game.
- Authoring-error negatives (ticket 004).

## Acceptance Criteria

### Tests That Must Pass

1. New game compiles deterministically — `pnpm turbo build` run twice produces byte-identical compiled GameDef.
2. Seeded random-agent fixture game plays to terminal within the bounded turn budget.
3. Existing engine suite continues to pass: `pnpm turbo test`.

### Invariants

1. No game-specific engine code added anywhere outside `data/games/<chosen-name>/` and its associated fixture (Foundation #1).
2. All rule-authoritative data lives in GameSpecDoc YAML (Foundation #2). No hidden zones, no private state, no per-seat observability differences (this is the public-observability axis).
3. No per-game schema files (Foundation #6).

## Test Plan

### New/Modified Tests

1. Fixture file (path TBD at implementation start) pinning the seeded random-agent play-through — serves as the determinism witness for ticket 002's per-game compile-determinism invariant.

### Commands

1. `pnpm turbo build` (run twice; diff compiled GameDef) — determinism check.
2. `pnpm -F @ludoforge/engine test` — verify the fixture passes.
3. `pnpm turbo test` — full suite regression check.

## Outcome

Completed 2026-05-26.

Implemented **Generic Control** as the user-approved, Foundation-aligned, data-only perfect-information control corpus game:

- Added `data/games/generic-control.game-spec.md` and `data/games/generic-control/` with metadata, verbalization, vocabulary, rules/actions, data assets, terminal scoring, agents, and public observability.
- Added `packages/engine/test/architecture/fixtures/generic-control-terminal-fixture.ts` to pin the seeded bounded play-through fixture.
- Added `packages/engine/test/architecture/generic-control-corpus-game.test.ts` to prove byte-identical double compilation and terminal fixture play.

Scope notes:

- No engine primitives, schemas, or runtime logic changed.
- `visual-config.yaml` remains intentionally omitted because runner integration is out of scope for Spec 198 ticket 001.
- The fixture is a TS architecture fixture helper, matching the existing `packages/engine/test/architecture/fixtures/` convention.

Verification:

- `pnpm turbo build` — passed.
- `pnpm turbo build` — passed again from cache; the new architecture test also compares the two compiled Generic Control `GameDef` JSON byte strings.
- `pnpm -F @ludoforge/engine build` — passed after adding the explicit fixture helper.
- `node --test dist/test/architecture/generic-control-corpus-game.test.js` from `packages/engine` — passed.
- `pnpm -F @ludoforge/engine test` — passed; default lane reported `173/173 files passed`.
- `pnpm turbo test` — passed after the final fixture helper change; Turbo reported `5 successful, 5 total`.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm run check:ticket-deps` — passed.
- `rg -n '[ \t]+$' ...` over changed files — no matches.
- `git diff --check` — passed.
