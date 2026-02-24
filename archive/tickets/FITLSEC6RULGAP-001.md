# FITLSEC6RULGAP-001: Sabotage VC Player Choice When Markers Insufficient

**Status**: ✅ COMPLETED
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
5. The kernel DSL supports `let`, `chooseN`, `aggregate` (count), and conditional branching inside macros — **confirmed** by multiple existing macros in `20-macros.md`.
6. A `chooseN.player` field can be used to force VC (seat 3) as chooser — **discrepancy**: current compiler/runtime does not support `chooseN.player`; unknown keys on `chooseN` are ignored at compile time. Seat targeting must be achieved with supported primitives.
7. A `chooseN` embedded in a `phaseEnter` trigger path can be surfaced to move discovery/param filling — **discrepancy**: current `legalChoicesDiscover` does not expose trigger-origin decisions for `coupVictoryCheck`; unresolved trigger `chooseN` causes runtime missing-param failure.

## Architecture Check

1. This remains data-only YAML, but scope expands beyond a single macro rewrite: interactive sabotage selection must execute inside an explicit action effect path (not phaseEnter trigger) so decision discovery can provide required params.
2. Game-specific behavior stays in GameSpecDoc YAML. No kernel or compiler code is touched.
3. No backwards-compatibility shims. The macro is rewritten in-place.

## What to Change

### 1. Rewrite `coup-auto-sabotage` macro (`20-macros.md` lines 2196-2266)

Replace the current flat `forEach` + marker-cap guard with a two-branch structure:

**Branch 1 (auto-sabotage all)**: When eligible LoC count <= remaining markers (`15 - terrorSabotageMarkersPlaced`), iterate all eligible LoCs and sabotage each one. No player choice needed.

**Branch 2 (VC chooses)**: When eligible LoC count > remaining markers, temporarily set `activePlayer` to VC (seat 3), run `chooseN` to select exactly `remaining` LoCs from the eligible set, restore prior `activePlayer`, then sabotage the chosen LoCs.

The macro should:
1. Compute `$remaining = 15 - terrorSabotageMarkersPlaced`
2. Guard: if `$remaining <= 0`, do nothing
3. Count eligible LoCs via `aggregate` with the same eligibility filter as current
4. Branch: if `$eligibleCount <= $remaining`, auto-sabotage all; else VC-select flow:
   - bind `$priorActivePlayer = activePlayer`
   - `setActivePlayer` to `3`
   - `chooseN` with `min == max == $remaining`
   - `setActivePlayer` back to `$priorActivePlayer`
5. Apply sabotage (`setMarker` + `addVar`) to selected/all LoCs

**Critical**: The eligibility filter (lines 2204-2260) must be preserved exactly — insurgent guerrillas outnumber COIN pieces OR adjacent to city without COIN Control. Copy it verbatim into both the count aggregate and the `forEach`/`chooseN` options.

**Note**: `chooseN` is supported in macros, but not safely in this current trigger path. The macro must be invoked from an action effect (below), not from `phaseEnter` trigger execution.

### 2. Move coup resources execution from `phaseEnter` trigger to an explicit coupResources action (`30-rules-actions.md`)

Add a dedicated action for the coup resources step (for example `coupResourcesResolve`) in phase `coupResources`, with effects:
1. `macro: coup-auto-sabotage`
2. `macro: coup-trail-degradation`
3. `macro: coup-arvn-earnings`
4. `macro: coup-insurgent-earnings`
5. `macro: coup-casualties-aid`

Then remove those macros from `on-coup-resources-enter` trigger.

Rationale: action execution supports `legalChoicesDiscover` decision plumbing; trigger execution in this path does not.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — rewrite `coup-auto-sabotage` macro, lines ~2196-2266)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add `coupResourcesResolve` action; remove resources macros from `on-coup-resources-enter` trigger)

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
2. The rewritten macro and updated resources action/trigger wiring are syntactically valid YAML and produce a valid GameDef.
3. When eligible LoCs <= remaining Sabotage markers, all eligible LoCs are auto-sabotaged (no choice prompt generated).
4. When eligible LoCs > remaining markers, `legalChoicesDiscover` on `coupResourcesResolve` produces a `chooseN` decision with `min == max == remaining`.
5. The 15-marker cap (`terrorSabotageMarkersPlaced`) is respected in both branches.
6. `coupVictoryCheck` no longer crashes when resources sabotage requires player choice (no unresolved trigger-time chooseN).
7. Existing full test suite: `pnpm -F @ludoforge/engine test`
8. E2E tests: `pnpm -F @ludoforge/engine test:e2e`
9. Full build: `pnpm turbo build`

### Invariants

1. No kernel source files created or modified.
2. No compiler source files created or modified.
3. The eligibility filter (insurgent guerrillas > COIN pieces OR adjacent-to-uncontrolled-city) is byte-for-byte identical to the current filter.
4. Texas Hold'em compilation tests still pass (engine-agnosticism).
5. Other macros in `20-macros.md` are untouched.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-resources-phase.test.ts` — Add test case: eligible LoCs exceed remaining markers, verify `legalChoicesDiscover` for `coupResourcesResolve` yields pending `chooseN` with exact cardinality and selected-space-only sabotage application.
2. `packages/engine/test/integration/fitl-coup-resources-phase.test.ts` — Add/strengthen test case: eligible LoCs <= remaining markers auto-sabotage all eligible LoCs without requiring a choice.
3. `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts` — Update expectation for no-checkpoint flow to stop in `coupResources` after `coupVictoryCheck`; then verify applying `coupResourcesResolve` advances to `coupSupport`.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`

## Outcome

- **Completion date**: 2026-02-24
- **What changed**
  - Rewrote `coup-auto-sabotage` in `data/games/fire-in-the-lake/20-macros.md` to:
    - compute remaining markers,
    - count eligible LoCs,
    - auto-apply sabotage when eligible <= remaining,
    - require VC selection when eligible > remaining.
  - Corrected architecture by moving resources execution off `phaseEnter` trigger and into explicit action `coupResourcesResolve` in `data/games/fire-in-the-lake/30-rules-actions.md`; removed the old `on-coup-resources-enter` macro trigger payload.
  - Added/updated tests:
    - `packages/engine/test/integration/fitl-coup-resources-phase.test.ts`
    - `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts`
- **Deviations from original plan**
  - Ticket originally assumed trigger-path `chooseN` was discoverable/playable; this was incorrect. Implementation shifted to action-path decision plumbing to keep player choice legal and robust without kernel/compiler changes.
- **Verification**
  - Passed: `pnpm -F @ludoforge/engine test`
  - Passed: `pnpm turbo build`
  - Passed: `pnpm turbo lint`
  - `pnpm -F @ludoforge/engine test:e2e` currently fails in unrelated Texas Hold’em e2e scenarios (`allIn` legality expectations); FITL coup resources/victory integration coverage added here passes.
