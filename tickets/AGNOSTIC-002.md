# AGNOSTIC-002: Explicit Board-Zone Contract for `mapSpaces` Queries

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes
**Deps**: None

## Problem

`mapSpaces` and `tokensInMapSpaces` queries currently treat "map space" as "zone with `category` defined". Because `category` is optional, a valid board space can silently disappear from map-space queries when category is omitted.

Affected path:
- `packages/engine/src/kernel/eval-query.ts`

## What Must Change

1. Introduce an explicit, game-agnostic board-zone discriminator in schema/types (example: `zoneKind: 'board' | 'aux'`).

2. Ensure map payload compilation marks map-derived zones explicitly as board zones in:
- `packages/engine/src/cnl/compile-data-assets.ts`
- `packages/engine/src/cnl/compile-zones.ts` (preserve discriminator through materialization)

3. Update query execution to use the explicit discriminator for:
- `query: 'mapSpaces'`
- `query: 'tokensInMapSpaces'`

4. Add validation diagnostics so map-derived zones cannot be silently unqueryable.

5. Remove any remaining inference that "board zone = has category".

## Invariants

1. Every map-derived zone is included by `mapSpaces` queries even when `category` is absent.
2. Non-board zones are excluded from `mapSpaces` queries.
3. `tokensInMapSpaces` and `mapSpaces` use the same board-zone selection contract.
4. Zone category remains optional metadata and is no longer used as identity.
5. Contract remains game-agnostic and data-driven.

## Tests That Should Pass

1. `packages/engine/test/unit/eval-query.test.ts`
- New case: board zone without category is returned by `mapSpaces`.
- New case: aux/non-board zone with category is not returned by `mapSpaces`.
- New case: `tokensInMapSpaces` mirrors the same selection behavior.

2. `packages/engine/test/integration/fitl-production-data-compilation.test.ts`
- Update assertions to align with explicit board-zone discriminator.

3. `packages/engine/test/unit/json-schema.test.ts`
- Update schema fixtures/expectations for new discriminator.

4. `pnpm -F @ludoforge/engine test`
