# Spec 120: Marker Effect Domain Separation

**Status**: COMPLETED
**Priority**: P3 (quality/maintainability)
**Complexity**: M
**Dependencies**: None
**Estimated effort**: 1-2 days
**Source**: `reports/architectural-abstractions-2026-04-09-fitl-events-1968-nva.md` — Fracture #2 (Overloaded abstraction)

## Overview

Split `packages/engine/src/kernel/effects-choice.ts` (1542 lines) into two single-responsibility modules: one for decision effects (chooseOne, chooseN, rollRandom) and one for marker mutation effects (setMarker, shiftMarker, setGlobalMarker, shiftGlobalMarker, flipGlobalMarker). The current file carries two distinct lifecycle domains with separate dependency graphs, separate test scenario families, and no cross-domain coupling beyond generic scope/binding utilities.

Counter-evidence check confirmed: `updateChoiceScope` is purely choice-scoped (never touches marker state), lattice resolution helpers are exclusively called from marker effects, and the two groups have cleanly separate dependency trees (~1114 lines decision, ~428 lines marker).

## Scope

### In Scope

- Extract marker mutation effects from `effects-choice.ts` into a new `effects-markers.ts`
- Move `resolveMarkerLattice` and `resolveGlobalMarkerLattice` helpers into `effects-markers.ts`
- Update imports in `effect-registry.ts` and `effect-compiler-codegen.ts` to import marker effects from the new module
- Keep generic scope/binding utilities (`updateChoiceScope`, `resolveChoiceBindings`, `resolveChoiceTraceProvenance`) in `effects-choice.ts` — they are consumed by both modules but defined alongside the decision effects that use them most

### Out of Scope

- Renaming `effects-choice.ts` (it retains decision effects — the name is acceptable)
- Extracting shared utilities into a third module (premature unless the refactor reveals tighter coupling than expected)
- Changing any effect behavior or signatures
- Modifying the effect registry dispatch mechanism
- Addressing "Needs investigation" item A (globalMarker defaultState projection drift) — tracked separately

## Architecture

### Current Structure

```
effects-choice.ts (1542 lines)
  ├── Generic utilities: updateChoiceScope, resolveChoiceBindings, resolveChoiceTraceProvenance, etc.
  ├── Decision effects: applyChooseOne (~120 lines), applyChooseN (~240 lines), applyRollRandom (~145 lines)
  ├── Marker lattice resolution: resolveMarkerLattice, resolveGlobalMarkerLattice (~25 lines total)
  └── Marker mutation effects: applySetMarker (~85 lines), applyShiftMarker (~90 lines),
      applySetGlobalMarker (~55 lines), applyShiftGlobalMarker (~65 lines), applyFlipGlobalMarker (~100 lines)
```

### Target Structure

```
effects-choice.ts (~1114 lines)
  ├── Generic utilities: updateChoiceScope, resolveChoiceBindings, resolveChoiceTraceProvenance, etc.
  ├── Decision-specific helpers: normalizeChooseNSelectionValues, validateChooseNSelectionSequence,
  │   buildChooseNPendingChoice, resolvePrioritizedTierEntries, resolveChoiceDecisionPlayer,
  │   buildComparableDomainBindingMap, resolveFixedRandomBinding, collectNestedOutcomes,
  │   toStochasticPendingChoice, mergePendingChoiceRequests, etc.
  └── Decision effects: applyChooseOne, applyChooseN, applyRollRandom

effects-markers.ts (~428 lines)
  ├── Marker lattice resolution: resolveMarkerLattice, resolveGlobalMarkerLattice
  └── Marker mutation effects: applySetMarker, applyShiftMarker, applySetGlobalMarker,
      applyShiftGlobalMarker, applyFlipGlobalMarker
```

### Import Changes

**`effects-markers.ts` imports from `effects-choice.ts`**:
- `updateChoiceScope` (or its constituent parts: scope state assignment + binding resolution)
- `resolveChoiceTraceProvenance`

**`effects-markers.ts` imports from other modules**:
- `advanceScope` from `decision-scope.js`
- `effectRuntimeError` from `effect-error.js`
- `findSpaceMarkerConstraintViolation`, `resolveSpaceMarkerShift` from `space-marker-rules.js`
- `ensureMarkerCloned`, `MutableGameState` from `state-draft.js`
- `addToRunningHash`, `updateRunningHash` from `zobrist.js`

**`effect-registry.ts`** — split import: decision effects from `effects-choice.js`, marker effects from `effects-markers.js`

**`effect-compiler-codegen.ts`** — same split import pattern

### Why This Split Point

The marker effects import from `space-marker-rules.ts`, `state-draft.ts` (for `ensureMarkerCloned`), and `zobrist.ts` (for hash updates). Decision effects import from the choice/decision subsystem (`choose-n-*.ts`, `prioritized-tier-legality.ts`, `choice-target-kinds.ts`). These are entirely disjoint dependency trees that happen to share a file.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|------------|-----------|
| F1 (Engine Agnosticism) | Aligned — marker operations remain fully generic |
| F8 (Determinism) | Neutral — no behavioral change |
| F11 (Immutability) | Neutral — no behavioral change |
| F14 (No Backwards Compatibility) | Aligned — clean split, no shims or re-exports needed |
| F15 (Architectural Completeness) | Aligned — directly addresses an overloaded abstraction |

## Risks

1. **Shared utility coupling**: If `updateChoiceScope` or `resolveChoiceBindings` need marker-aware logic in the future, the import direction (markers -> choice) would become awkward. Mitigation: monitor during implementation; if coupling appears, extract shared utilities to a third module at that point.
2. **Merge conflicts**: If other branches are modifying `effects-choice.ts`, the split will conflict. Mitigation: coordinate timing.

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests pass unchanged — this is a pure refactoring with no behavioral changes
2. `pnpm turbo test` passes
3. `pnpm turbo typecheck` passes
4. `pnpm turbo lint` passes

### Invariants

1. Every effect function retains its exact signature and behavior
2. The effect registry maps to the same functions (just from different modules)
3. No new public exports are created beyond the moved functions
4. `effects-choice.ts` no longer contains any marker-related code
5. `effects-markers.ts` does not contain any decision/choice-related code

## Test Plan

### New/Modified Tests

None required. This is a move-only refactoring. All existing tests that exercise marker and decision effects continue to pass without modification.

### Commands

1. `pnpm turbo build` (verify compilation)
2. `pnpm turbo test --force` (full fresh test run)
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-04-09
- What actually changed: marker lattice helpers and marker mutation effects were extracted from [packages/engine/src/kernel/effects-choice.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effects-choice.ts) into [packages/engine/src/kernel/effects-markers.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effects-markers.ts), and [packages/engine/src/kernel/effect-registry.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effect-registry.ts) plus [packages/engine/src/kernel/effect-compiler-codegen.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effect-compiler-codegen.ts) were updated to import marker effects from the new module.
- Deviations from original plan: none identified from the landed implementation.
- Verification results: current code inspection confirms marker effect exports live in [packages/engine/src/kernel/effects-markers.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effects-markers.ts) and registry/codegen imports point to that module; commit `68498669` records the implementation.
