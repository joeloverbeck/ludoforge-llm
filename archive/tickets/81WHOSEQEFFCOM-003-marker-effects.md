# 81WHOSEQEFFCOM-003: Compile marker effects (setMarker, shiftMarker, setGlobalMarker, flipGlobalMarker, shiftGlobalMarker)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts, effects-choice.ts (reuse only; no new marker semantics)
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md

## Problem

Five marker effects (tags 17-21) fall back to the interpreter. Marker effects are heavily used in FITL for tracking faction support, opposition, and game state markers. Each interpreter fallback incurs the full dispatch pipeline. All five share a common pattern: resolve a marker target, read/write a value, update the Zobrist hash.

## Assumption Reassessment (2026-03-25)

1. Marker effects are NOT in a separate marker module. The authoritative runtime implementations already exist in `packages/engine/src/kernel/effects-choice.ts` as `applySetMarker`, `applyShiftMarker`, `applySetGlobalMarker`, `applyFlipGlobalMarker`, and `applyShiftGlobalMarker`.
2. `EFFECT_KIND_TAG` defines: `setMarker` (17), `shiftMarker` (18), `setGlobalMarker` (19), `flipGlobalMarker` (20), `shiftGlobalMarker` (21).
3. Zone-scoped markers use `state.markers[zoneId][markerName]`. Global markers use `state.globalMarkers[markerName]`.
4. Marker mutations already own non-trivial semantics in `effects-choice.ts`: zone normalization, lattice lookup, legality/constraint validation, dynamic binding resolution, `DraftTracker.ensureMarkerCloned` for zone marker writes, and Zobrist updates via `updateRunningHash` / `addToRunningHash`.
5. `flipGlobalMarker` is not a fixed-literal effect. Its `marker`, `stateA`, and `stateB` inputs are general value expressions and must preserve the interpreter's runtime validation semantics.
6. The current compiled-path test center of gravity is `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts`. Pattern matching tests exist in `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts`, but parity and tracker behavior assertions belong in the codegen suite.

## Architecture Check

1. All five marker effects are leaf effects and are good compilation candidates.
2. Re-implementing their semantics directly in `effect-compiler-codegen.ts` would duplicate complex, correctness-critical logic already centralized in `effects-choice.ts`.
3. The clean architecture is closure compilation that bridges directly into the existing marker handlers, exactly as `compileTransferVar` already bridges into `applyTransferVar`.
4. This preserves one source of truth for marker legality, selector normalization, tracker behavior, and Zobrist mutation while still removing interpreter dispatch/classification overhead for compiled lifecycle sequences.

## What to Change

### 1. Add pattern descriptors for all 5 marker effects

In `effect-compiler-patterns.ts`:
- `SetMarkerPattern`: preserve full `setMarker` payload
- `ShiftMarkerPattern`: preserve full `shiftMarker` payload
- `SetGlobalMarkerPattern`: preserve full `setGlobalMarker` payload
- `FlipGlobalMarkerPattern`: preserve full `flipGlobalMarker` payload
- `ShiftGlobalMarkerPattern`: preserve full `shiftGlobalMarker` payload
- Add `matchSetMarker`, `matchShiftMarker`, `matchSetGlobalMarker`, `matchFlipGlobalMarker`, `matchShiftGlobalMarker`
- Wire into `classifyEffect` switch cases for tags 17-21

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileSetMarker(desc)` — bridge directly into `applySetMarker`
- `compileShiftMarker(desc)` — bridge directly into `applyShiftMarker`
- `compileSetGlobalMarker(desc)` — bridge directly into `applySetGlobalMarker`
- `compileFlipGlobalMarker(desc)` — bridge directly into `applyFlipGlobalMarker`
- `compileShiftGlobalMarker(desc)` — bridge directly into `applyShiftGlobalMarker`
- Wire into `compilePatternDescriptor` dispatcher

### 3. Preserve a single marker-semantics authority

- Do not duplicate lattice resolution, constraint checking, dynamic value evaluation, tracker copy-on-write rules, or Zobrist mutation logic in the compiler.
- If compiled marker behavior needs to change, change the handler implementation in `effects-choice.ts` and keep compiled closures as thin bridges.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify)

## Out of Scope

- Variable effects (ticket 002)
- Token effects (ticket 005)
- Turn flow effects (ticket 004)
- Condition compilation extensions
- Deleting `createFallbackFragment` (ticket 010)
- Action-context effects (`grantFreeOperation`)
- Trace emission for marker effects (if the interpreter emits trace entries for markers, the compiled closures must replicate them — but no NEW trace infrastructure is introduced)

## Acceptance Criteria

### Tests That Must Pass

1. Pattern unit tests cover `matchSetMarker`, `matchShiftMarker`, `matchSetGlobalMarker`, `matchFlipGlobalMarker`, and `matchShiftGlobalMarker`
2. Per-effect parity test: each compiled marker effect matches interpreted output for state, RNG, emitted events, bindings, and full hash
3. `flipGlobalMarker` parity explicitly covers dynamic binding-driven marker/state expressions
4. Tracker-path parity test: zone-scoped marker effects preserve mutable-path behavior and freeze to the same result as the interpreter
5. Coverage classification reflects marker effects as compilable descriptors
6. Existing suite: `pnpm -F @ludoforge/engine test`
7. Existing suite: `pnpm turbo typecheck`
8. Existing suite: `pnpm turbo lint`

### Invariants

1. Marker semantics remain single-sourced in `effects-choice.ts`
2. Zobrist hash updates for marker effects in compiled path are identical to interpreted path because both paths use the same handler logic
3. Zone marker tracker semantics remain identical to interpreted execution
4. Coverage ratio increases for sequences containing marker effects
5. `CompiledEffectFragment` contract unchanged

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add matcher/classification coverage for all 5 marker effects
2. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add parity tests for all 5 compiled marker effect generators, including tracker-path and dynamic `flipGlobalMarker` coverage

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-25
- Actual change: marker effects are now classified as compilable and compiled into thin bridge closures that call the existing authoritative marker handlers in `effects-choice.ts`.
- Actual change: no duplicate marker semantics were added to `effect-compiler-codegen.ts`; legality checks, selector normalization, tracker copy-on-write behavior, dynamic `flipGlobalMarker` evaluation, and Zobrist updates remain single-sourced in the runtime handlers.
- Actual change: added matcher/classification coverage for all five marker effects and parity coverage for compiled codegen, including dynamic `flipGlobalMarker` bindings and mutable tracker-path parity for zone markers.
- Deviation from original plan: the original ticket proposed re-implementing marker logic directly in compiler codegen. That was intentionally not done because it would have duplicated correctness-critical behavior and created architectural drift.
- Verification: `node packages/engine/dist/test/unit/kernel/effect-compiler-patterns.test.js`
- Verification: `node packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js`
- Verification: `pnpm -F @ludoforge/engine test`
- Verification: `pnpm turbo test`
- Verification: `pnpm turbo typecheck`
- Verification: `pnpm turbo lint`
