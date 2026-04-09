# 120MAREFFDOM-002: Update consumer imports to split modules

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect registry and codegen
**Deps**: `archive/tickets/120MAREFFDOM-001.md`

## Problem

After extracting marker effects into `effects-markers.ts` (ticket 001), the two consumers — `effect-registry.ts` and `effect-compiler-codegen.ts` — still import marker effect functions from `effects-choice.ts`. Their import statements must be split to reference the correct source modules.

## Assumption Reassessment (2026-04-09)

1. `effect-registry.ts` imports all 8 effect functions from `effects-choice.js` (lines 20–28) — confirmed
2. `effect-compiler-codegen.ts` imports 7 effect functions (all except `applyRollRandom`) from `effects-choice.js` (lines 58–66) — confirmed
3. No test files import directly from `effects-choice.ts` — tests use the effect registry or barrel exports — confirmed
4. No other source files import from `effects-choice.ts` beyond the two consumers above — confirmed

## Architecture Check

1. Minimal blast radius — only 2 files need import updates, zero test files affected
2. Engine agnosticism preserved — import restructuring only, no behavioral changes
3. No backwards-compatibility shims — marker effect imports point directly to `effects-markers.js`, no re-exports from `effects-choice.js`

## What to Change

### 1. Update `effect-registry.ts` imports

Split the single import from `./effects-choice.js` into two:

```typescript
// Decision effects — from effects-choice
import { applyChooseOne, applyChooseN, applyRollRandom } from './effects-choice.js';
// Marker effects — from effects-markers
import { applySetMarker, applyShiftMarker, applySetGlobalMarker, applyShiftGlobalMarker, applyFlipGlobalMarker } from './effects-markers.js';
```

The registry object mappings remain unchanged — same keys, same functions.

### 2. Update `effect-compiler-codegen.ts` imports

Split the single import from `./effects-choice.js` into two:

```typescript
// Decision effects — from effects-choice
import { applyChooseOne, applyChooseN } from './effects-choice.js';
// Marker effects — from effects-markers
import { applySetMarker, applyShiftMarker, applySetGlobalMarker, applyShiftGlobalMarker, applyFlipGlobalMarker } from './effects-markers.js';
```

All usage sites remain unchanged — same function calls.

### 3. Clean up marker-only imports from `effects-choice.ts`

Verify that `effects-choice.ts` no longer imports symbols used exclusively by marker effects. If `findSpaceMarkerConstraintViolation`, `resolveSpaceMarkerShift`, `ensureMarkerCloned`, `addToRunningHash`, or `updateRunningHash` are no longer referenced in `effects-choice.ts`, remove those import lines. (Some may still be used by shared utilities — check before removing.)

## Files to Touch

- `packages/engine/src/kernel/effect-registry.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify — import cleanup)

## Out of Scope

- Moving any functions — that was done in ticket 001
- Modifying the effect registry dispatch mechanism
- Changing any effect behavior or signatures

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` compiles without errors
2. `pnpm turbo typecheck` passes
3. `pnpm turbo test --force` — all tests pass (effects dispatched correctly through registry)
4. `pnpm turbo lint` passes

### Invariants

1. The effect registry maps to the same functions — just imported from different modules
2. No re-exports of marker effects from `effects-choice.ts`
3. `effects-choice.ts` has zero unused imports after cleanup

## Test Plan

### New/Modified Tests

None — existing tests exercise effects through the registry and codegen pipeline. All must pass unchanged.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test --force`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-09
- Changed:
  - no standalone implementation was performed for this ticket
- Deviations from original plan:
  - this ticket's owned import rewiring and `effects-choice.ts` import cleanup were absorbed into `120MAREFFDOM-001` after reassessment showed they were required for an atomic Foundation 14-compliant extraction
- Verification:
  - no ticket-local commands were run under this ticket
  - the absorbed work was verified under `120MAREFFDOM-001` with `pnpm turbo build` and `pnpm turbo typecheck`
