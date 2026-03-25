# 81WHOSEQEFFCOM-003: Compile marker effects (setMarker, shiftMarker, setGlobalMarker, flipGlobalMarker, shiftGlobalMarker)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md

## Problem

Five marker effects (tags 17-21) fall back to the interpreter. Marker effects are heavily used in FITL for tracking faction support, opposition, and game state markers. Each interpreter fallback incurs the full dispatch pipeline. All five share a common pattern: resolve a marker target, read/write a value, update the Zobrist hash.

## Assumption Reassessment (2026-03-25)

1. Marker effects are NOT in a separate `effects-marker.ts` file. They are dispatched through the general effect handler system. Need to locate the actual handler implementations — likely in `effects-control.ts` or dispatched via the effect registry.
2. `EFFECT_KIND_TAG` defines: `setMarker` (17), `shiftMarker` (18), `setGlobalMarker` (19), `flipGlobalMarker` (20), `shiftGlobalMarker` (21).
3. Zone-scoped markers use `state.markers[zoneId][markerName]`. Global markers use `state.globalMarkers[markerName]`.
4. Zobrist hash updates are required for all marker mutations: `updateRunningHash` from `zobrist.ts` for zone markers, similar for global markers.
5. `DraftTracker` provides `ensureMarkerCloned` for copy-on-write zone marker mutations.
6. The compiled `setVar`/`addVar` patterns in `effect-compiler-codegen.ts` serve as close analogues for marker effects.

## Architecture Check

1. Global marker effects (`setGlobalMarker`, `flipGlobalMarker`, `shiftGlobalMarker`) are the simplest — they read/write `state.globalMarkers` directly with Zobrist hash updates. Similar to `setVar` for globals.
2. Zone-scoped marker effects (`setMarker`, `shiftMarker`) need zone resolution and `ensureMarkerCloned` via `DraftTracker`.
3. All five effects are leaf effects — no nested bodies, no control flow, no recursion. They are pure state mutations.
4. Zobrist hash update pattern: XOR out old feature, XOR in new feature via `ctx.cachedRuntime?.zobristTable`.

## What to Change

### 1. Add pattern descriptors for all 5 marker effects

In `effect-compiler-patterns.ts`:
- `SetMarkerPattern`: zone selector, marker name, value expression
- `ShiftMarkerPattern`: zone selector, marker name, delta expression
- `SetGlobalMarkerPattern`: marker name, value expression
- `FlipGlobalMarkerPattern`: marker name, value-if-A, value-if-B (conditional swap)
- `ShiftGlobalMarkerPattern`: marker name, delta expression
- Add `matchSetMarker`, `matchShiftMarker`, `matchSetGlobalMarker`, `matchFlipGlobalMarker`, `matchShiftGlobalMarker`
- Wire into `classifyEffect` switch cases for tags 17-21

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileSetMarker(desc)` — resolve zone, read old marker, write new value via `ensureMarkerCloned`, Zobrist hash update
- `compileShiftMarker(desc)` — like `setMarker` with delta arithmetic and clamping
- `compileSetGlobalMarker(desc)` — write to `state.globalMarkers`, Zobrist hash update
- `compileFlipGlobalMarker(desc)` — conditional swap between two values, Zobrist hash update
- `compileShiftGlobalMarker(desc)` — delta on global marker, clamping, Zobrist hash update
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

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

1. Per-effect-type unit test: `compileSetMarker` writes correct marker value to the resolved zone, Zobrist hash matches
2. Per-effect-type unit test: `compileShiftMarker` applies delta with clamping, Zobrist hash matches
3. Per-effect-type unit test: `compileSetGlobalMarker` writes to `globalMarkers`, Zobrist hash matches
4. Per-effect-type unit test: `compileFlipGlobalMarker` swaps between two values correctly, Zobrist hash matches
5. Per-effect-type unit test: `compileShiftGlobalMarker` applies delta with clamping, Zobrist hash matches
6. Parity test: each marker effect compiled output matches interpreted output (state hash, rng, events)
7. Zobrist hash parity: compiled marker mutations produce identical Zobrist hashes to interpreted path
8. DraftTracker test: `setMarker`/`shiftMarker` use `ensureMarkerCloned` for copy-on-write
9. Existing suite: `pnpm turbo test`
10. Existing suite: `pnpm turbo typecheck`

### Invariants

1. Zobrist hash updates for marker effects in compiled path are identical to interpreted path
2. `DraftTracker.ensureMarkerCloned` is called before any zone marker mutation
3. Coverage ratio increases for sequences containing marker effects
4. Verification mode (7-dimension parity check) passes for all lifecycle sequences
5. `CompiledEffectFragment` contract unchanged

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for all 5 compiled marker effect generators
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for all 5 marker match functions

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
