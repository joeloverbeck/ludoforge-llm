# 149FITLEVNUMVM-004: EncodedStateLayout builder from GameDef

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new `packages/engine/src/kernel/encoded-state/` module
**Deps**: `specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md`

## Problem

Phase 1 of spec 149 introduces a derived numeric encoded-state projection consulted by agent preview drives. The first deliverable is a generic builder that walks compiled `GameDef` surfaces (specifically `tokenTypes`, marker lattices, the player-count domain, `zones`, the variable namespace, and asset-derived runtime surfaces when a descriptor needs them) at compile time to produce an `EncodedStateLayout` — the shape descriptor for the typed-array view that subsequent tickets (005, 006) will populate and consume.

## Assumption Reassessment (2026-04-28)

1. `GameDef` is defined in `packages/engine/src/kernel/types.ts` and exposes `runtimeDataAssets`, `tokenTypes`, `markerLattices`/`globalMarkerLattices`, `zones`, player-count metadata, and compiled variable definitions. Raw `dataAssets` belong to `GameSpecDoc`/CNL input and are lowered into `runtimeDataAssets` before the kernel boundary.
2. The branded id types `ZoneId`, `TokenId`, `PlayerId`, `ActionId`, `PhaseId`, `TriggerId`, `SeatId` exist in `packages/engine/src/kernel/branded.ts`. `MarkerId` and `VariableId` are NOT currently branded — the layout treats them uniformly as integer indices over their string-identifier domain (per spec §7 F17 row).
3. No existing `EncodedStateLayout`, `TokenLayout`, `MarkerLayout`, `VarLayout`, or `BitsetLayout` type exists in the codebase (confirmed via Glob).

## Architecture Check

1. The builder walks `GameDef`'s generic primitives only — no FITL-specific branches. F1 (Engine Agnosticism) preserved.
2. The output is a derived projection used internally by agent preview; no game-specific schema files added. F6 (Schema Ownership Stays Generic) preserved.
3. The layout is computed once per drive call and is read-only; no state mutation. F11 preserved (mutation comes in ticket 008).
4. No backwards-compatibility shims — this is greenfield infrastructure (F14).

## What to Change

### 1. New module `packages/engine/src/kernel/encoded-state/`

Create the directory with two files (this ticket lands `layout.ts`; ticket 005 lands `view.ts`):

**`packages/engine/src/kernel/encoded-state/layout.ts`** — exports:
- `interface EncodedStateLayout` with fields per spec §2.2: `zoneIds`, `tokenIds`, `playerIds`, `markerIds`, `variableIds` (readonly index→id arrays), plus `tokenLayout`, `markerLayout`, `varLayout`, `bitsetLayout` descriptors.
- `interface TokenLayout`, `interface MarkerLayout`, `interface VarLayout`, `interface BitsetLayout` — descriptor types for each domain (record type counts, bit positions, byte offsets, etc.).
- `function buildEncodedStateLayout(def: GameDef): EncodedStateLayout` — pure function walking GameDef.

**`packages/engine/src/kernel/encoded-state/index.ts`** — barrel export of layout types and the builder.

### 2. Layout determinism

`buildEncodedStateLayout` MUST be deterministic: same `GameDef` input → byte-identical layout output. Achieve this by sorting id arrays by canonical string order (the existing convention used by `gamedef-runtime.ts` for stable iteration).

### 3. Type tests for layout shape

Add a unit test verifying layout shape against the reference FITL fixture (`data/games/fire-in-the-lake*`'s compiled GameDef).

## Files to Touch

- `packages/engine/src/kernel/encoded-state/layout.ts` (new)
- `packages/engine/src/kernel/encoded-state/index.ts` (new)
- `packages/engine/test/unit/kernel/encoded-state-layout.test.ts` (new)

## Out of Scope

- The `EncodedState` typed-array view itself (covered by ticket 005).
- Wiring the layout into `policy-runtime` read paths (covered by ticket 006).
- Apply/undo log machinery (covered by ticket 008).
- Bytecode compiler integration with the layout (covered by ticket 011 forward).

## Acceptance Criteria

### Tests That Must Pass

1. New test: `buildEncodedStateLayout` returns a layout whose `zoneIds`/`tokenIds`/`playerIds`/`markerIds`/`variableIds` arrays match the FITL GameDef's enumerated values.
2. New test: layout is byte-identical across two builder invocations on the same `GameDef` input (determinism check).
3. New test: layout works for both FITL and Texas Hold'em GameDefs (game-agnostic check).
4. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. No game-specific (FITL, Texas) branches in the builder.
2. Layout output is fully derived from GameDef; no external state consulted.
3. F1, F6, F8 preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/encoded-state-layout.test.ts` — coverage for FITL fixture, Texas Hold'em fixture, determinism, error paths (malformed GameDef).

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/encoded-state-layout.test.js`.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.

## Outcome (2026-04-29)

Completed under the Foundations-aligned boundary reset approved on 2026-04-29:

- Corrected the ticket/spec boundary from raw `dataAssets` to compiled `GameDef` surfaces; raw `dataAssets` remain a GameSpecDoc/CNL input, and `runtimeDataAssets` is the compiled asset boundary for future descriptors that need asset payloads.
- Added `packages/engine/src/kernel/encoded-state/layout.ts` and `index.ts`.
- Exported the encoded-state module from the kernel barrel for later Phase 1/Phase 3 consumers.
- Added `packages/engine/test/unit/kernel/encoded-state-layout.test.ts` covering FITL, Texas Hold'em, deterministic layout output, and malformed player-count metadata.

Initial proof completed before this closeout note:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/encoded-state-layout.test.js` — PASS.

Final acceptance proof:

- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/encoded-state-layout.test.js` — PASS after the final broad build/typecheck output.
- `pnpm -F @ludoforge/engine test:unit` — RED, repo-preexisting unrelated blocker: `dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js` reports `test/integration/fitl-no-turn-1-terminal.test.ts` present in `integration:game-packages` but missing from the guard's expected set. This ticket does not touch `packages/engine/scripts/test-lane-manifest.mjs`, the integration file, or the taxonomy guard.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js` — RED with the same unrelated taxonomy mismatch.
- `pnpm turbo build` — PASS.
- `pnpm turbo lint` — PASS.
- `pnpm turbo typecheck` — PASS.
