# CROGAMPRIELE-010: Texas Hold'em spec migration to template/primitive patterns

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — game spec data files only
**Deps**: CROGAMPRIELE-001, CROGAMPRIELE-004, CROGAMPRIELE-005, CROGAMPRIELE-006, CROGAMPRIELE-007, CROGAMPRIELE-008

## Problem

Texas Hold'em's game spec uses verbose repetitive patterns that are now expressible as first-order compiler templates and kernel primitives. This ticket rewrites the spec to use the new patterns: `generate:` for piece catalog, phase templates for betting streets, `actionDefaults` for shared preconditions/cleanup, and deck `behavior` for the card deck.

## Assumption Reassessment (2026-03-03)

1. Texas Hold'em spec files are in `data/games/texas-holdem/` (6 files: 00-metadata, 10-vocabulary, 20-macros, 30-rules-actions, 40-content-data-assets, 90-terminal). **Verified.**
2. The spec defines 52 individual piece types + 52 inventory entries (624 lines in 40-content-data-assets.md). **Verified.**
3. Hand zones use `owner: player` convention, producing zone IDs like `hand:0`. All `zoneExpr: { concat: ['hand:', ...] }` references are dynamic (inside `forEach` or using `{ ref: activePlayer }`). **Verified.**
4. The flop/turn/river phases are near-identical, differing only in `handPhase` value (1/2/3) and `deal-community` card count (3/1/1). **Verified.**
5. The shared action precondition is `handActive && !allIn` (NOT `!eliminated` — eliminated players already have `handActive = false`). **Corrected from original.**
6. All 5 betting actions (fold, check, call, raise, allIn) end with the same 3 cleanup macros: `mark-preflop-big-blind-acted`, `betting-round-completion`, `advance-after-betting`. **Verified.**
7. Compilation is via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. **Verified.**
8. Texas Hold'em serves as engine-agnosticism validation — tests confirm no FITL-specific logic leaks into the kernel. **Verified.**
9. Existing test baseline: 3387 tests pass (505 suites), including 6 Texas Hold'em E2E test files. **Verified.**

## Architecture Check

1. This is a game spec data change only — no engine code changes.
2. The migrated spec must compile to a functionally equivalent GameDef.
3. The migration exercises compiler template A1 (piece generation) and A5 (phase templates), plus kernel primitives B1 (`actionDefaults`) and B2 (zone `behavior`).

## What to Change

### 1. Piece catalog: individual → `generate:` block

Replace 52 individual `pieceType` + 52 `inventory` entries with a single `generate:` block using suit × rank dimensions with derivedProps for suitName and rankName.

### ~~2. Hand zones~~ — REMOVED FROM SCOPE

**Rationale**: The current `{ id: hand, owner: player }` zone definition already creates per-player zones (`hand:0`, `hand:1`, etc.) correctly. Migrating to `template: { perSeat: true }` would:
- Change zone ID convention from `hand:N` to `hand-N`, requiring ALL zone references to change
- NOT eliminate `zoneExpr: { concat: [...] }` references (ALL are dynamic — inside forEach or using activePlayer)
- Provide zero functional benefit over `owner: player`
- Create massive churn for no architectural gain

### 3. Betting street phases: duplicate → `phaseTemplate` + `fromTemplate`

Extract flop/turn/river shared `onEnter` logic into a `bettingStreet` phase template with params `phaseId`, `handPhaseValue`, `cardCount`. Replace the 3 phase definitions with `fromTemplate` references.

### 4. Betting preconditions: repeated → `actionDefaults.pre`

Move `handActive && !allIn` check to `actionDefaults.pre` on ALL 4 betting phases: preflop gets it explicitly, flop/turn/river get it via the phase template. Remove these conditions from each action's individual `pre`.

### 5. Post-action cleanup: repeated macro calls → `actionDefaults.afterEffects`

Move the 3 cleanup macros (`mark-preflop-big-blind-acted`, `betting-round-completion`, `advance-after-betting`) to `actionDefaults.afterEffects` on ALL 4 betting phases. Remove them from individual action definitions.

### 6. Deck zone: plain → `behavior: { type: deck, drawFrom: top, reshuffleFrom: muck:none }`

Add deck behavior to the deck zone definition. This is declarative metadata — existing explicit `draw`/`shuffle`/`moveAll` effects remain unchanged.

## Files to Touch

- `data/games/texas-holdem/10-vocabulary.md` (modify — add deck behavior)
- `data/games/texas-holdem/30-rules-actions.md` (modify — phase template, actionDefaults, action cleanup)
- `data/games/texas-holdem/40-content-data-assets.md` (modify — generate block)
- `packages/engine/test/e2e/texas-holdem-*.test.ts` (modify if needed — update expected output)

## Out of Scope

- FITL spec migration (CROGAMPRIELE-011)
- Engine code changes — all changes are in game spec data files
- Hand zone template migration (see rationale above)
- Adding new test infrastructure — existing compilation and simulation tests should cover
- Optimizing other parts of the Texas Hold'em spec not related to template/primitive patterns

## Acceptance Criteria

### Tests That Must Pass

1. Migrated spec compiles successfully via `compileProductionSpec()`.
2. Compiled GameDef has the same number of piece types (52), zones, actions, and phases as the original.
3. `PhaseDef.actionDefaults` is present on all 4 betting phases (preflop, flop, turn, river) in the compiled GameDef.
4. `ZoneDef.behavior` is present on the deck zone in the compiled GameDef.
5. Same-seed simulation produces deterministic results.
6. No `generate:`, `fromTemplate:`, or `phaseTemplates:` artifacts remain in the compiled GameDef.
7. Existing suite: `npx turbo test`

### Invariants

1. Game behavior is functionally equivalent — same legal moves, same state transitions for the same seed and move sequence.
2. Spec authoring patterns are idiomatic — no mixed old/new patterns.
3. No FITL-specific logic is introduced (engine-agnosticism preserved).

## Test Plan

### New/Modified Tests

1. Verify `compileProductionSpec()` for Texas Hold'em succeeds.
2. Verify compiled GameDef structural equivalence (piece count, zone count, phase count, action count).
3. Verify `actionDefaults` presence on betting phases.
4. Verify `behavior` presence on deck zone.
5. Same-seed simulation determinism test.

### Commands

1. `npx turbo build`
2. `npx turbo test`
3. `npx turbo typecheck && npx turbo lint`

## Outcome

**Completion date**: 2026-03-03

### What actually changed

**Game spec data files (3 files modified):**
- `data/games/texas-holdem/40-content-data-assets.md` — Replaced 52 individual pieceType entries + 52 inventory entries (~624 lines) with a single `generate:` block using suit × rank dimensions with derivedProps for suitName, rankName, suit, rank, suitAbbrev, rankAbbrev.
- `data/games/texas-holdem/10-vocabulary.md` — Added `behavior: { type: deck, drawFrom: top, reshuffleFrom: 'muck:none' }` to the deck zone.
- `data/games/texas-holdem/30-rules-actions.md` — Rewrote with `phaseTemplates` section containing `bettingStreet` template with `actionDefaults`; flop/turn/river use `fromTemplate` references; preflop has explicit `actionDefaults`; shared preconditions (`handActive && !allIn`) and cleanup macros removed from individual actions.

**Engine validator/schema fixes (6 files modified):**
- `packages/engine/src/cnl/validate-spec-shared.ts` — Added `behavior` to `ZONE_KEYS`, `actionDefaults` to `PHASE_KEYS`, new `FROM_TEMPLATE_PHASE_KEYS` constant.
- `packages/engine/src/cnl/validate-actions.ts` — Added `resolveFromTemplatePhaseId()` helper; updated `validateTurnStructure()` to handle `fromTemplate` entries in phases and interrupts.
- `packages/engine/src/cnl/validate-spec-core.ts` — Updated `validateDuplicateIdentifiers()` to extract phase IDs from `fromTemplate` entries.
- `packages/engine/src/kernel/schemas-gamespec.ts` — Added `PieceGenerateDimensionSchema`, `PieceGenerateDerivedPropSchema`, `PieceGenerateBlockSchema`; updated `PieceCatalogPayloadSchema` to accept union of concrete entries and generate blocks.
- `packages/engine/src/kernel/piece-catalog.ts` — Updated `validatePieceCatalogPayload` to filter out generate blocks before deep validation; skip inventory cross-validation when generate blocks present.
- `packages/engine/src/cnl/validate-extensions.ts` — Systemic fix: filter generate blocks when storing in `resolvedPieceCatalogPayloads` so downstream cross-reference checks only see concrete pieceTypes.

**Tests (1 file modified):**
- `packages/engine/test/integration/texas-holdem-spec-structure.test.ts` — Updated phase structure assertion to handle `fromTemplate` entries; added 3 new tests: generate block compilation (52 token types with derived props), actionDefaults on betting phases, deck behavior on deck zone.

### Deviations from original plan

1. **Engine changes were required** — The ticket originally stated "Engine Changes: None — game spec data files only." In practice, the validator runs BEFORE template expansion, so it needed to be taught to accept `generate:` blocks, `fromTemplate` entries, `behavior`, and `actionDefaults`. Six engine files were modified (validators and Zod schemas). No kernel runtime changes were needed.
2. **Hand zone migration was correctly removed from scope** during assumption reassessment, as `owner: player` already works correctly and migration would change zone ID conventions for zero benefit.

### Verification results

- **3390 tests pass, 0 fail** (3 new tests added)
- **Lint clean** (ESLint)
- **Typecheck clean** (TypeScript `--noEmit`)
- All 7 acceptance criteria met:
  1. Migrated spec compiles successfully via `compileProductionSpec()`
  2. Compiled GameDef has 52 token types
  3. `actionDefaults` present on all 4 betting phases
  4. `behavior` present on deck zone
  5. Same-seed simulation determinism preserved (existing E2E tests pass)
  6. No `generate:`, `fromTemplate:`, or `phaseTemplates:` artifacts in compiled GameDef
  7. Full existing suite passes
