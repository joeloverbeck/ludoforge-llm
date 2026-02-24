# FITLSEC6RULGAP-001: Sabotage VC Player Choice When Markers Insufficient

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — data-only YAML
**Deps**: None

## Problem

Rule 6.2.1: "Sabotage each unSabotaged LoC where Insurgent Guerrillas outnumber COIN pieces or adjacent to a City without COIN Control (**until no Sabotage markers remain, VC chooses which spaces first**)."

Currently, the `coup-auto-sabotage` macro in `20-macros.md` (lines 2196-2266) iterates all eligible LoCs via `forEach` and auto-sabotages each one as long as the `terrorSabotageMarkersPlaced < 15` guard holds. When markers run out mid-iteration, remaining eligible LoCs are silently skipped. The VC player (seat 3) has no agency over which spaces are prioritized when eligible LoCs exceed remaining markers.

## Assumption Reassessment (2026-02-24)

1. The `coup-auto-sabotage` macro exists at `20-macros.md` lines 2196-2266 — **confirmed** by reading the file.
2. The macro uses `forEach` with a marker-cap `if` guard inside the loop body — **confirmed**: line 2262-2266 show `if: when: { op: '<', left: { ref: gvar, var: terrorSabotageMarkersPlaced }, right: 15 }`.
3. The eligibility filter checks (a) zone is LoC category, (b) not already sabotaged, (c) insurgent guerrillas > COIN pieces OR adjacent city without COIN control — **confirmed** by reading lines 2204-2260.
4. No existing `chooseN` or `let`/branch pattern exists in this macro — **confirmed**; the macro is a flat `forEach` with a cap guard.
5. The kernel DSL supports `let`, `chooseN`, `aggregate` (count), and conditional branching inside macros — assumed based on spec sketch; implementer must verify `chooseN` within macro context.

## Architecture Check

1. This is purely a macro logic restructure in game data YAML — no engine/compiler changes. The approach uses existing DSL primitives (`let`, `chooseN`, `forEach`, `aggregate`, conditional branching).
2. Game-specific behavior stays in GameSpecDoc YAML. No kernel or compiler code is touched.
3. No backwards-compatibility shims. The macro is rewritten in-place.

## What to Change

### 1. Rewrite `coup-auto-sabotage` macro (`20-macros.md` lines 2196-2266)

Replace the current flat `forEach` + marker-cap guard with a two-branch structure:

**Branch 1 (auto-sabotage all)**: When eligible LoC count <= remaining markers (`15 - terrorSabotageMarkersPlaced`), iterate all eligible LoCs and sabotage each one. No player choice needed.

**Branch 2 (VC chooses)**: When eligible LoC count > remaining markers, present VC (seat 3) with a `chooseN` to select exactly `remaining` LoCs from the eligible set, then sabotage the chosen LoCs.

The macro should:
1. Compute `$remaining = 15 - terrorSabotageMarkersPlaced`
2. Guard: if `$remaining <= 0`, do nothing
3. Count eligible LoCs via `aggregate` with the same eligibility filter as current
4. Branch: if `$eligibleCount <= $remaining`, auto-sabotage all; else `chooseN` for VC
5. Apply sabotage (`setMarker` + `addVar`) to selected/all LoCs

**Critical**: The eligibility filter (lines 2204-2260) must be preserved exactly — insurgent guerrillas outnumber COIN pieces OR adjacent to city without COIN Control. Copy it verbatim into both the count aggregate and the `forEach`/`chooseN` options.

**Note**: The implementer must verify that `chooseN` works correctly inside a macro expansion context. If `chooseN` is not supported in macros, the fallback approach is to restructure this as a phaseEnter trigger action instead of a macro.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — rewrite `coup-auto-sabotage` macro, lines ~2196-2266)

## Out of Scope

- Kernel source code (`packages/engine/src/kernel/`)
- Compiler source code (`packages/engine/src/cnl/`)
- Other macros in `20-macros.md` (trail degradation, earnings, casualties, redeploy, commitment, reset)
- `30-rules-actions.md` (pacification, agitation, or any other action)
- Eligibility criteria changes (the filter logic must remain identical)
- Test fixture files (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`)

## Acceptance Criteria

### Tests That Must Pass

1. FITL production spec compiles without errors: `compileProductionSpec()` returns no error-severity diagnostics.
2. The rewritten macro is syntactically valid YAML and produces a valid GameDef.
3. When eligible LoCs <= remaining Sabotage markers, all eligible LoCs are auto-sabotaged (no choice prompt generated).
4. When eligible LoCs > remaining markers, the compiled GameDef contains a `chooseN` (or equivalent player-choice construct) targeting VC (seat 3) with `min == max == remaining`.
5. The 15-marker cap (`terrorSabotageMarkersPlaced`) is respected in both branches.
6. Existing full test suite: `pnpm -F @ludoforge/engine test`
7. E2E tests: `pnpm -F @ludoforge/engine test:e2e`
8. Full build: `pnpm turbo build`

### Invariants

1. No kernel source files created or modified.
2. No compiler source files created or modified.
3. The eligibility filter (insurgent guerrillas > COIN pieces OR adjacent-to-uncontrolled-city) is byte-for-byte identical to the current filter.
4. Texas Hold'em compilation tests still pass (engine-agnosticism).
5. Other macros in `20-macros.md` are untouched.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-resources-phase.test.ts` — Add test case: compile production def, set up a state where eligible LoCs exceed remaining markers, verify that the compiled macro produces a choice-type move for seat 3 (VC).
2. `packages/engine/test/integration/fitl-coup-resources-phase.test.ts` — Add test case: compile production def, set up a state where eligible LoCs <= remaining markers, verify all eligible LoCs are auto-sabotaged without a choice.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
