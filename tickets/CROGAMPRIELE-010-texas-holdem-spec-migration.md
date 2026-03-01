# CROGAMPRIELE-010: Texas Hold'em spec migration to template/primitive patterns

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — game spec data files only
**Deps**: CROGAMPRIELE-001, CROGAMPRIELE-004, CROGAMPRIELE-005, CROGAMPRIELE-006, CROGAMPRIELE-007, CROGAMPRIELE-008

## Problem

Texas Hold'em's game spec uses verbose repetitive patterns that are now expressible as first-order compiler templates and kernel primitives. This ticket rewrites the spec to use the new patterns: `generate:` for piece catalog, zone templates for per-player hands, phase templates for betting streets, `actionDefaults` for shared preconditions/cleanup, and deck `behavior` for the card deck.

## Assumption Reassessment (2026-03-01)

1. Texas Hold'em spec files are in `data/games/texas-holdem/`.
2. The spec defines 52 individual piece types, per-player hand zones via `zoneExpr: { concat: [...] }`, 3 near-identical betting street phases, repeated `handActive && !allIn && !eliminated` preconditions, and 3 cleanup macros per action.
3. Compilation is via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`.
4. Texas Hold'em serves as engine-agnosticism validation — tests confirm no FITL-specific logic leaks into the kernel.

## Architecture Check

1. This is a game spec data change only — no engine code changes.
2. The migrated spec must compile to a functionally equivalent GameDef.
3. The migration exercises all 5 compiler templates (A1, A4, A5) and both kernel primitives (B1, B2), validating their real-world utility.

## What to Change

### 1. Piece catalog: individual → `generate:` block

Replace 52 individual `pieceType` + `inventory` entries with a single `generate:` block using suit x rank dimensions with derivedProps for suitName, suitAbbrev, rankName.

### 2. Hand zones: individual/zoneExpr → `template:` with `perSeat: true`

Replace per-player hand zone declarations with `template: { idPattern: "hand-{seat}", perSeat: true, owner: player, visibility: owner, ordering: set }`. Update all `zoneExpr: { concat: ['hand:', ...] }` references throughout the spec to use direct zone ID references (e.g., `hand-0`, `hand-1`).

### 3. Betting street phases: duplicate → `phaseTemplate` + `fromTemplate`

Extract flop/turn/river shared `onEnter` logic into a `bettingStreet` phase template with params `phaseId`, `handPhaseValue`, `cardCount`. Replace the 3 phase definitions with `fromTemplate` references.

### 4. Betting preconditions: repeated → `actionDefaults.pre`

Move `handActive && !allIn && !eliminated` check to `actionDefaults.pre` on each betting phase (or shared via the phase template's `actionDefaults`).

### 5. Post-action cleanup: repeated macro calls → `actionDefaults.afterEffects`

Move the 3 cleanup macros (mark-preflop-big-blind-acted, betting-round-completion, advance-after-betting) to `actionDefaults.afterEffects` on betting phases. Remove them from individual action definitions.

### 6. Deck zone: plain → `behavior: { type: deck, drawFrom: top, reshuffleFrom: muck }`

Add deck behavior to the deck zone definition.

## Files to Touch

- `data/games/texas-holdem/*.md` (modify — spec files)
- `packages/engine/test/e2e/texas-holdem-*.test.ts` (modify if any exist — update expected output if needed)

## Out of Scope

- FITL spec migration (CROGAMPRIELE-011)
- Engine code changes — all changes are in game spec data files
- Adding new test infrastructure — existing compilation and simulation tests should cover
- Optimizing other parts of the Texas Hold'em spec not related to template/primitive patterns

## Acceptance Criteria

### Tests That Must Pass

1. Migrated spec compiles successfully via `compileProductionSpec()`.
2. Compiled GameDef has the same number of piece types (52), zones, actions, and phases as the original.
3. `PhaseDef.actionDefaults` is present on betting phases in the compiled GameDef.
4. `ZoneDef.behavior` is present on the deck zone in the compiled GameDef.
5. Same-seed simulation produces deterministic results.
6. No `generate:`, `batch:`, `template:`, `fromTemplate:`, or `phaseTemplates:` artifacts remain in the compiled GameDef.
7. All `zoneExpr: { concat: [...] }` references are eliminated from the spec.
8. Existing suite: `pnpm turbo test`

### Invariants

1. Game behavior is functionally equivalent — same legal moves, same state transitions for the same seed and move sequence.
2. Spec authoring patterns are idiomatic — no mixed old/new patterns.
3. No FITL-specific logic is introduced (engine-agnosticism preserved).

## Test Plan

### New/Modified Tests

1. Verify `compileProductionSpec()` for Texas Hold'em succeeds.
2. Run same-seed simulation before and after migration, compare final state hashes (if feasible — may need a new golden test).

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test`
3. `pnpm turbo typecheck && pnpm turbo lint`
