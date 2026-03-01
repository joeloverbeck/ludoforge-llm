# CROGAMPRIELE-011: FITL spec migration to template/primitive patterns

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — game spec data files only
**Deps**: CROGAMPRIELE-002, CROGAMPRIELE-003, CROGAMPRIELE-004, CROGAMPRIELE-006, CROGAMPRIELE-007, CROGAMPRIELE-008

## Problem

FITL's game spec uses verbose repetitive patterns now expressible as first-order compiler templates and kernel primitives. This ticket rewrites the spec to use: `batch:` for capability markers and operation counters/momentum flags, zone templates for per-faction zones, `actionDefaults` for shared eligibility checks and post-operation bookkeeping, and deck `behavior` for the event deck.

## Assumption Reassessment (2026-03-01)

1. FITL spec files are in `data/games/fire-in-the-lake/`.
2. The spec defines 20 capability markers (identical 3-state), 13 operation counters (identical int), ~18 momentum flags (identical boolean), 8 per-faction zones, and repeated eligibility/bookkeeping patterns across operations.
3. Compilation is via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`.
4. Foundation fixtures (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`) are separate from production spec and are NOT migrated here.

## Architecture Check

1. This is a game spec data change only — no engine code changes.
2. The migrated spec must compile to a functionally equivalent GameDef.
3. The migration exercises batch templates (A2, A3), zone templates (A4), and both kernel primitives (B1, B2), validating their real-world utility for a different game.

## What to Change

### 1. Capability markers: 20 individual → `batch:`

Replace 20 individual `globalMarkerLattices` entries (all sharing `states: [inactive, unshaded, shaded]`, `defaultState: inactive`) with a single `batch:` block.

### 2. Operation counters: 13 individual → `batch:`

Replace 13 individual `globalVars` int entries (all sharing `type: int`, `init: 0`, `min: 0`, `max: 20`) with a single `batch:` block.

### 3. Momentum flags: ~18 individual → `batch:`

Replace ~18 individual `globalVars` boolean entries (all sharing `type: boolean`, `init: false`) with a single `batch:` block.

### 4. Per-faction zones: 8 individual → `template:` with `perSeat: true`

Replace 8 per-faction zones (available-{faction} and out-of-play-{faction}) with 2 zone templates.

### 5. Main phase actions: `actionDefaults.pre` for shared eligibility

Move common eligibility preconditions to `actionDefaults.pre` on the main phase. Remove duplicated conditions from individual operation actions.

### 6. Post-operation bookkeeping: `actionDefaults.afterEffects`

Move common counter-update and eligibility-update macro calls to `actionDefaults.afterEffects` on the main phase. Remove duplicated macros from individual operation actions.

### 7. Event deck zone: `behavior: { type: deck, drawFrom: top }` (no reshuffleFrom)

Add deck behavior to the event deck zone. FITL does not reshuffle — empty deck triggers coup resolution.

### 8. (Evaluate) Coup sub-phase templates

Assess whether coup sub-phases share enough reset logic to benefit from a `phaseTemplate`. If the shared logic is substantial, extract it. If not, document the decision and skip.

## Files to Touch

- `data/games/fire-in-the-lake/*.md` (modify — spec files)
- `packages/engine/test/e2e/fitl-*.test.ts` (modify if any exist — update expected output if needed)

## Out of Scope

- Texas Hold'em spec migration (CROGAMPRIELE-010)
- Engine code changes — all changes are in game spec data files
- Foundation fixtures (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`) — these are minimal engine-level test fixtures, not production spec
- Combinatorial piece generation (A1) — FITL pieces have per-faction property differences that make individual declarations clearer
- Phase templates for coup sub-phases — evaluated but only implemented if the shared logic is substantial enough

## Acceptance Criteria

### Tests That Must Pass

1. Migrated spec compiles successfully via `compileProductionSpec()`.
2. Compiled GameDef has the same number of marker lattices (20 + individual ones), variables, zones, actions, and phases as the original.
3. `PhaseDef.actionDefaults` is present on the main phase in the compiled GameDef.
4. `ZoneDef.behavior` is present on the event deck zone in the compiled GameDef.
5. Same-seed simulation produces deterministic results.
6. No `batch:` or `template:` artifacts remain in the compiled GameDef.
7. Existing suite: `pnpm turbo test`

### Invariants

1. Game behavior is functionally equivalent — same legal moves, same state transitions for the same seed and move sequence.
2. Spec authoring patterns are idiomatic — no mixed old/new patterns.
3. Foundation fixtures are unchanged — only production spec files are migrated.
4. No Texas Hold'em-specific logic is introduced (engine-agnosticism preserved).

## Test Plan

### New/Modified Tests

1. Verify `compileProductionSpec()` for FITL succeeds.
2. Run existing FITL game-rule tests against migrated spec.
3. If feasible, compare same-seed simulation state hashes before/after migration.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test`
3. `pnpm turbo typecheck && pnpm turbo lint`
