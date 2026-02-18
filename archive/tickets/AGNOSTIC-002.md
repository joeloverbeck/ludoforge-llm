# AGNOSTIC-002: Explicit Board-Zone Contract for `mapSpaces` Queries

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes
**Deps**: None

## Reassessment (2026-02-18)

The original ticket correctly identified a bug in query execution (`mapSpaces`/`tokensInMapSpaces` selecting zones via `category !== undefined`), but it understated architecture impact.

Current code also treats "map space" as "`category` present" in validation context construction and map-space reference checks:
- `packages/engine/src/kernel/validate-gamedef-structure.ts`
- `packages/engine/src/kernel/validate-gamedef-behavior.ts`

So changing query execution alone would leave compiler/runtime contracts internally inconsistent (query behavior, diagnostics, and map-space property validation would disagree).

## Updated Architectural Decision

Introduce a first-class, game-agnostic zone discriminator on `ZoneDef`:
- `zoneKind: 'board' | 'aux'`

Contract:
- `zoneKind: 'board'` means the zone participates in board-space queries (`mapSpaces`, `tokensInMapSpaces`) and map-space validation context.
- `zoneKind: 'aux'` means non-board/support zones (hands, decks, discard, out-of-play pools, etc.).
- `category` remains optional descriptive metadata only (for filtering/grouping), never identity.

## Problem

`mapSpaces` and `tokensInMapSpaces` queries currently treat "map space" as "zone with `category` defined". Because `category` is optional, a valid board space can silently disappear from map-space queries when category is omitted.

Affected path:
- `packages/engine/src/kernel/eval-query.ts`

## What Must Change

1. Introduce an explicit, game-agnostic board-zone discriminator in schema/types: `zoneKind: 'board' | 'aux'`.
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-gamespec.ts`
- `packages/engine/schemas/GameDef.schema.json` (via schema artifact generation flow)

2. Ensure compilation marks map-derived zones explicitly as board zones in:
- `packages/engine/src/cnl/compile-data-assets.ts`
- `packages/engine/src/cnl/compile-zones.ts` (preserve discriminator through materialization)

3. Update query execution to use the explicit discriminator for:
- `query: 'mapSpaces'`
- `query: 'tokensInMapSpaces'`

4. Update validation context + diagnostics to use the explicit discriminator (not `category` inference):
- `packages/engine/src/kernel/validate-gamedef-structure.ts`
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (should continue working but against new context data)

5. Remove remaining inference that "board zone = has category" in touched files.

6. Backfill defaults for non-map/manual zones to keep contracts explicit:
- map-derived zones => `zoneKind: 'board'`
- all other zones => `zoneKind: 'aux'`

## Invariants

1. Every map-derived zone is included by `mapSpaces` queries even when `category` is absent.
2. Non-board zones are excluded from `mapSpaces` queries.
3. `tokensInMapSpaces` and `mapSpaces` use the same board-zone selection contract.
4. Zone category remains optional metadata and is no longer used as identity.
5. Contract remains game-agnostic and data-driven.
6. Validation map-space candidates are sourced from `zoneKind === 'board'`.

## Tests That Should Pass

1. `packages/engine/test/unit/eval-query.test.ts`
- New case: board zone without category is returned by `mapSpaces`.
- New case: aux/non-board zone with category is not returned by `mapSpaces`.
- New case: `tokensInMapSpaces` mirrors the same selection behavior.

2. `packages/engine/test/integration/fitl-production-data-compilation.test.ts`
- Update assertions to align with explicit board-zone discriminator where map spaces are inspected.

3. `packages/engine/test/unit/json-schema.test.ts`
- Update schema fixtures/expectations for new discriminator.

4. `packages/engine/test/unit/validate-gamedef.test.ts`
- Add/adjust coverage that map-space references use `zoneKind` contract (not `category` presence).

5. `pnpm -F @ludoforge/engine test`

## Outcome

**Completion Date**: 2026-02-18

### What Changed
- Added `zoneKind` discriminator support across compiler/runtime contracts and schema artifacts:
  - `packages/engine/src/kernel/types-core.ts`
  - `packages/engine/src/kernel/schemas-core.ts`
  - `packages/engine/schemas/GameDef.schema.json`
- Map-derived zones are now emitted as `zoneKind: 'board'` in `packages/engine/src/cnl/compile-data-assets.ts`.
- Zone materialization now normalizes/validates `zoneKind` and defaults non-specified zones to `aux` in `packages/engine/src/cnl/compile-zones.ts`.
- `mapSpaces` and `tokensInMapSpaces` now select zones by `zoneKind === 'board'` in `packages/engine/src/kernel/eval-query.ts`.
- Validation map-space context now keys off `zoneKind` (not category presence) in `packages/engine/src/kernel/validate-gamedef-structure.ts`.
- YAML zone validation now recognizes/validates `zoneKind` in:
  - `packages/engine/src/cnl/validate-spec-shared.ts`
  - `packages/engine/src/cnl/validate-zones.ts`

### Test Coverage Added/Adjusted
- `packages/engine/test/unit/eval-query.test.ts`
- `packages/engine/test/unit/validate-gamedef.test.ts`
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts`
- `packages/engine/test/unit/json-schema.test.ts`
- Additional alignment updates in related unit/golden fixtures:
  - `packages/engine/test/unit/eval-value.test.ts`
  - `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - `packages/engine/test/fixtures/cnl/compiler/compile-valid.golden.json`

### Deviations From Original Plan
- `zoneKind` is optional at raw `ZoneDef` boundary/schema level, but compiler output now always materializes explicit values (`board` for map-derived, `aux` otherwise).  
  This avoids broad unrelated fixture churn while preserving strict runtime board-selection semantics.

### Verification
- `pnpm -F @ludoforge/engine build` ✅
- `pnpm -F @ludoforge/engine schema:artifacts` ✅
- `pnpm -F @ludoforge/engine lint` ✅
- `pnpm -F @ludoforge/engine test` ✅
