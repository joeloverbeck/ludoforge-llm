# 120MAREFFDOM-001: Extract marker effects into effects-markers.ts

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect modules
**Deps**: None

## Problem

`packages/engine/src/kernel/effects-choice.ts` (1542 lines) carries two unrelated lifecycle domains — decision effects and marker mutation effects — with zero cross-domain coupling. This overloaded abstraction hinders navigability and violates single-responsibility. Extracting marker effects into a dedicated module makes each file focused and easier to reason about.

## Assumption Reassessment (2026-04-09)

1. `effects-choice.ts` exists at 1542 lines with 8 exported effect functions — confirmed via file read
2. Marker effects occupy lines 1115–1542 (~428 lines): `applySetMarker`, `applyShiftMarker`, `applySetGlobalMarker`, `applyShiftGlobalMarker`, `applyFlipGlobalMarker` — confirmed
3. Marker lattice helpers `resolveMarkerLattice` (line 513) and `resolveGlobalMarkerLattice` (line 526) are called exclusively from marker effects, never from decision effects — confirmed via grep
4. Shared utilities `updateChoiceScope`, `resolveChoiceBindings`, `resolveChoiceTraceProvenance` are module-private (`const`, not exported) — they must be exported for the new module to import them
5. `advanceScope` is imported from `decision-scope.js`, `effectRuntimeError` from `effect-error.js` — not locally defined

## Architecture Check

1. Clean domain separation: marker effects have a disjoint dependency tree (space-marker-rules, state-draft/ensureMarkerCloned, zobrist) from decision effects (choose-n-*, prioritized-tier-legality, choice-target-kinds). Splitting along this boundary is natural.
2. Engine agnosticism preserved — marker operations remain fully generic, no game-specific logic introduced.
3. No backwards-compatibility shims — clean split, no re-exports from effects-choice.ts for moved functions.

## Confirmed Scope Correction (2026-04-09)

The original ticket marked `effect-registry.ts` and `effect-compiler-codegen.ts` as out of scope. Live code imports all five marker handlers from `effects-choice.ts`, so moving those handlers without updating the two consumers would fail the ticket's own `pnpm turbo build` and `pnpm turbo typecheck` acceptance gates. User confirmation authorized widening this ticket to absorb those adjacent import updates for an atomic Foundation 14-compliant refactor.

## What to Change

### 1. Create `packages/engine/src/kernel/effects-markers.ts`

Move the following from `effects-choice.ts`:
- `resolveMarkerLattice` (~line 513)
- `resolveGlobalMarkerLattice` (~line 526)
- `applySetMarker` (lines 1115–1202)
- `applyShiftMarker` (lines 1204–1295)
- `applySetGlobalMarker` (lines 1297–1354)
- `applyShiftGlobalMarker` (lines 1356–1423)
- `applyFlipGlobalMarker` (lines 1425–1542)

Export all 5 `apply*` functions. Keep `resolveMarkerLattice` and `resolveGlobalMarkerLattice` as module-private.

### 2. Add imports to `effects-markers.ts`

From `effects-choice.js`:
- `updateChoiceScope`
- `resolveChoiceTraceProvenance`

From other modules:
- `advanceScope` from `./decision-scope.js`
- `effectRuntimeError` from `./effect-error.js`
- `findSpaceMarkerConstraintViolation`, `resolveSpaceMarkerShift` from `./space-marker-rules.js`
- `ensureMarkerCloned`, type `MutableGameState` from `./state-draft.js`
- `addToRunningHash`, `updateRunningHash` from `./zobrist.js`
- All other types needed by the moved functions (EffectEnv, EffectCursor, ReadContext, etc.)

### 3. Export shared utilities from `effects-choice.ts`

`updateChoiceScope` and `resolveChoiceTraceProvenance` are currently `const` (module-private). Export them so `effects-markers.ts` can import them. Do NOT rename them.

### 4. Remove moved code from `effects-choice.ts`

Delete the marker effect functions, lattice helpers, and any imports that are now only used by marker effects (e.g., `findSpaceMarkerConstraintViolation`, `resolveSpaceMarkerShift`, `ensureMarkerCloned` if no longer referenced).

### 5. Update marker effect consumers for atomicity

Split marker effect imports in:
- `packages/engine/src/kernel/effect-registry.ts`
- `packages/engine/src/kernel/effect-compiler-codegen.ts`

Decision effects remain imported from `effects-choice.ts`; marker effects must import from `effects-markers.ts`.

## Files to Touch

- `packages/engine/src/kernel/effects-markers.ts` (new)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/effect-registry.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- Further follow-on cleanup from ticket 002 beyond the atomic import split required to keep this extraction buildable
- Renaming `effects-choice.ts`
- Extracting shared utilities into a third module
- Changing any effect behavior or signatures
- Addressing globalMarker defaultState projection drift

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` compiles without errors (effects-markers.ts resolves all imports)
2. `pnpm turbo typecheck` passes

### Invariants

1. Every moved effect function retains its exact signature and behavior
2. `effects-choice.ts` no longer contains any marker-related code (no `applySetMarker`, `applyShiftMarker`, `applySetGlobalMarker`, `applyShiftGlobalMarker`, `applyFlipGlobalMarker`, `resolveMarkerLattice`, `resolveGlobalMarkerLattice`)
3. `effects-markers.ts` does not contain any decision/choice-related code
4. No new public exports beyond the 5 moved apply functions and the 2 shared utilities

## Test Plan

### New/Modified Tests

None — this is a move-only refactoring. Existing tests exercise effects through the registry, not direct imports.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`

## Outcome

- Completed: 2026-04-09
- Changed:
  - extracted marker lattice helpers and marker effect handlers into `packages/engine/src/kernel/effects-markers.ts`
  - exported `updateChoiceScope` and `resolveChoiceTraceProvenance` from `packages/engine/src/kernel/effects-choice.ts`
  - split marker-effect consumer imports in `packages/engine/src/kernel/effect-registry.ts` and `packages/engine/src/kernel/effect-compiler-codegen.ts`
  - amended the ticket boundary to absorb the consumer import split required for a Foundation 14-compliant atomic refactor
- Deviations from original plan:
  - the original ticket said consumer import rewiring belonged to ticket 002; live code required that work here to satisfy the ticket's own build/typecheck gates, so the user confirmed widening 001 and 002 was left for series cleanup
- Verification:
  - `pnpm turbo build` passed
  - `pnpm turbo typecheck` passed
