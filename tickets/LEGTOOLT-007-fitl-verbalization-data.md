# LEGTOOLT-007: FITL Verbalization Data

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — data-only
**Deps**: LEGTOOLT-001 (schema extensions), archive/tickets/LEGTOOLT-005-template-realizer-improvements.md

## Problem

The FITL verbalization file (`data/games/fire-in-the-lake/05-verbalization.md`) currently has `labels`, `stages`, `macros`, `sentencePlans`, and `suppressPatterns` but no `stageDescriptions` or `modifierEffects`. Without this authored data, tooltips fall back to auto-generated text for stage headers and show no effect descriptions for capability modifiers.

## Assumption Reassessment (2026-03-07)

1. `data/games/fire-in-the-lake/05-verbalization.md` has verbalization YAML with labels (factions, pieces, zones, LOCs, markers), stages, macros, sentencePlans, and suppressPatterns.
2. No `stageDescriptions` or `modifierEffects` sections exist yet.
3. The `suppressPatterns` list currently includes `__*`, `fitl_*`, `mom_*` etc. The `$__macro_*` pattern should be added explicitly.
4. FITL has 19 capability markers (each with unshaded/shaded variants) that need `modifierEffects` entries.
5. US operations (Train, Patrol, Sweep, Assault) and special activities (Advise, Air Lift, Air Strike) have profile IDs that need `stageDescriptions`.

## Architecture Check

1. This is data authoring only — no code changes. The schema (LEGTOOLT-001) and realizer (LEGTOOLT-005) already support the fields.
2. Data stays in the game-specific `data/` directory, not in engine code — respects the Agnostic Engine Rule.
3. `stageDescriptions` keys must match profile IDs used in the action YAML definitions. Cross-reference against FITL operation profile files.

## What to Change

### 1. Add `stageDescriptions` for US operation profiles

Add `stageDescriptions` section to `05-verbalization.md` with entries for:
- `train-us-profile`: selectSpaces, placeForces, etc.
- `patrol-us-profile`: selectSpaces, moveForces, activateGuerrillas
- `sweep-us-profile`: selectSpaces, activateGuerrillas
- `assault-us-profile`: selectSpaces, removeEnemyPieces

Each entry has `label` (human-readable stage name) and optional `description` (what happens in that stage).

Expand incrementally to ARVN, NVA, VC operations as follow-up work.

### 2. Add `modifierEffects` for capability markers

Add `modifierEffects` section with entries for all 19 capabilities, keyed by capability variable name (e.g., `cap_m48Patton`, `cap_abrams`). Each entry is an array of `{ condition, effect }` objects for the shaded/unshaded variants.

Example:
```yaml
modifierEffects:
  cap_m48Patton:
    - condition: "M48 Patton is Shaded"
      effect: "Patrol costs 3 ARVN Resources"
  cap_abrams:
    - condition: "Abrams is Unshaded"
      effect: "+1 Assault removal per space"
```

### 3. Add `$__macro_*` to `suppressPatterns`

Add `$__macro_*` to the existing `suppressPatterns` list to suppress compiler-generated macro variable names.

### 4. Add US special activity stage descriptions

Add `stageDescriptions` for:
- `advise-us-profile`
- `air-lift-us-profile`
- `air-strike-us-profile`

## Files to Touch

- `data/games/fire-in-the-lake/05-verbalization.md` (modify)

## Out of Scope

- ARVN, NVA, VC operation profiles (follow-up work)
- Event card verbalization
- Engine code changes (all done in earlier tickets)

## Acceptance Criteria

### Tests That Must Pass

1. Golden test: compile FITL spec with `compileProductionSpec()`, verify `VerbalizationDef.stageDescriptions` contains US operation profile entries
2. Golden test: verify `VerbalizationDef.modifierEffects` contains all 19 capability entries
3. Golden test: verify `suppressPatterns` includes `$__macro_*`
4. Integration: compile US Train tooltip with verbalization, verify step headers resolve through stageDescriptions (e.g., "Select target spaces" instead of "selectSpaces")
5. Integration: compile tooltip with M48 Patton modifier active, verify condition+effect text appears
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. YAML is valid and parseable by the spec compiler
2. All profile IDs match actual profile IDs in FITL operation definitions
3. All capability variable names match actual capability variables in FITL data
4. No engine code changes — data only

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-tooltip-golden.test.ts` (new) — golden test compiling FITL spec and verifying tooltip output for US Train/Patrol with authored stage descriptions and modifier effects

### Commands

1. `pnpm -F @ludoforge/engine test:e2e` (E2E tests)
2. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full)
