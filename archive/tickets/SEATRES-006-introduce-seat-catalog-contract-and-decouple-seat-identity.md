# SEATRES-006: Introduce explicit SeatCatalog contract and decouple seat identity from piece/turn-flow structures

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel schemas + compiler + migration tooling + fixture/spec migration
**Deps**: archive/tickets/SEATRES-005-strict-single-seat-namespace-and-spec-migration.md

## Problem

Seat identity is currently inferred from surfaces that have different responsibilities:

1. `turnFlow.eligibility.seats` (turn-order behavior)
2. `pieceCatalog.seats` (piece ownership catalog)

Using either as an implicit source of truth couples unrelated domains and makes extensions fragile (seat metadata, seat groups, ordering policy, AI hints, etc.).

## Assumption Reassessment (2026-03-01)

1. The compiler currently builds seat identity in `seat-identity-contract.ts` from `turnFlow.eligibility.seats` and/or `pieceCatalog.payload.seats` (`none`, `piece-catalog-only`, `turn-flow-named`, `turn-flow-index-forbidden`), so seat identity is still not first-class.
2. `deriveSectionsFromDataAssets()` exports `GameDef.seats` from `pieceCatalog.payload.seats`, which couples seat identity ownership to piece catalog payload shape.
3. `PieceCatalogPayloadSchema` currently requires `payload.seats`, and `validatePieceCatalogPayload()` enforces undeclared-seat diagnostics against that local list.
4. No `seatCatalog` data-asset kind exists in `KNOWN_DATA_ASSET_KINDS` / `KnownDataAssetKindSchema`, and no `GameSpecDoc` JSON schema artifact file exists under `packages/engine/schemas/` (artifact list is `GameDef`, `Trace`, `EvalReport` only).
5. Repository specs/fixtures still rely on embedded seat declarations (`pieceCatalog.payload.seats`, plus turn-flow seat lists for order/eligibility).

## Architecture Check

1. A first-class `SeatCatalog` is the robust/extensible boundary: seat identity and metadata become explicit, versionable game data.
2. Turn-flow and piece-catalog should reference seat ids, not define seat identity.
3. This reinforces game-agnostic engine design: compiler/kernel consume generic seat contracts without game-specific branching.
4. No backward compatibility: embedded seat-definition paths are removed after migration.

## What to Change

### 1. Add explicit seat catalog to GameSpecDoc contract

1. Add a dedicated `dataAssets` kind `seatCatalog` with payload shape `seats: [{ id: string }]`.
2. Extend kernel schema/type surfaces so `seatCatalog` is recognized everywhere `map|scenario|pieceCatalog` kinds are enumerated.
3. Update validators so seat identity is declared only in `seatCatalog`; `pieceCatalog.payload.seats` becomes invalid (removed path).

### 2. Refactor compiler to consume SeatCatalog only for seat identity

1. Update seat-identity contract inputs/wiring so canonical seat ids come only from selected `seatCatalog`.
2. Keep `turnFlow.eligibility.seats` as turn-flow behavior data, but validate all seat references against canonical `seatCatalog` ids.
3. Remove legacy seat-identity inference/ownership from `pieceCatalog.payload.seats` and from turn-flow-only fallback behavior.

### 3. Migrate specs/fixtures and add migration tooling

1. Add/extend a migration utility that rewrites specs with `pieceCatalog.payload.seats` into explicit `seatCatalog` data assets and updates scenario references as needed.
2. Migrate repository fixtures and game docs/spec sources accordingly.
3. Update any golden outputs that intentionally change because seat identity source moved.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-gamespec.ts`
- `packages/engine/src/kernel/data-assets.ts`
- `packages/engine/src/kernel/piece-catalog.ts`
- `packages/engine/src/cnl/seat-identity-contract.ts`
- `packages/engine/src/cnl/compiler-core.ts`
- `packages/engine/src/cnl/cross-validate.ts`
- `packages/engine/src/cnl/compile-data-assets.ts`
- `packages/engine/src/cnl/validate-extensions.ts`
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts`
- `packages/engine/test/unit/data-assets.test.ts`
- `packages/engine/test/unit/compiler-structured-results.test.ts`
- `packages/engine/test/unit/cross-validate.test.ts`
- `packages/engine/test/integration/compile-pipeline.test.ts`
- `scripts/**` migration script(s) for seat-catalog conversion
- `data/games/**` migrated spec/game source artifacts
- `packages/engine/test/fixtures/**` updated fixtures/goldens
- `packages/engine/test/unit/**` and integration tests that validate seat contract behavior

## Out of Scope

- Visual presentation config (`visual-config.yaml`)
- Runtime gameplay-rule changes unrelated to seat identity contract ownership

## Acceptance Criteria

### Tests That Must Pass

1. `SeatCatalog` is required/validated as the sole seat identity declaration surface.
2. Compiler rejects specs that attempt to define seat identity via legacy embedded paths.
3. Migrated fixtures/specs compile and pass simulation regression suites.
4. Workspace quality gates pass: `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`.

### Invariants

1. Seat identity has one explicit schema-owned contract.
2. Piece catalog and turn-flow remain consumers of seat ids, not seat identity owners.
3. Engine/kernel/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert compiler fails when seat identity is missing from `SeatCatalog` or declared in legacy embedded locations.
Rationale: enforces the new schema boundary at compile entry.
2. `packages/engine/test/unit/cross-validate.test.ts` — assert all seat-reference surfaces validate against `SeatCatalog` ids.
Rationale: guarantees downstream consistency after boundary refactor.
3. `packages/engine/test/unit/data-assets.test.ts` — assert `seatCatalog` payload validation and `pieceCatalog.payload.seats` rejection.
Rationale: enforces the new ownership boundary at data-asset validation level.
4. `packages/engine/test/integration/compile-pipeline.test.ts` (or equivalent) — compile migrated fixtures that include `seatCatalog` and no legacy seat-definition paths.
Rationale: validates real-world migration outcomes, not only synthetic unit docs.
5. `packages/engine/test/e2e/**` relevant seat/turn-flow scenarios — refresh expected outputs where seat contract source changes.
Rationale: confirms end-to-end behavior remains stable after contract relocation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
4. `node --test packages/engine/dist/test/unit/data-assets.test.js`
5. `pnpm -F @ludoforge/engine test:all`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- Completion date: 2026-03-01
- What actually changed:
  - Added first-class `seatCatalog` data-asset support across kernel types/schemas/validators.
  - Removed embedded seat ownership from `pieceCatalog` payload contract and validation path.
  - Refactored seat-identity contract wiring to source canonical seat ids from `seatCatalog` only.
  - Updated turn-flow/event/xref validation to enforce seat references against `seatCatalog` ids.
  - Migrated FITL and Texas production data assets and engine fixtures/tests to the new contract.
  - Added dedicated seat-catalog validator module and exported it from kernel index.
- Deviations from original plan:
  - No standalone `scripts/**` migration utility was added in this ticket; repository fixtures/data were migrated directly in-tree.
  - FITL seat ids were normalized to lowercase canonical ids across production data and related integration assertions.
- Verification results:
  - `pnpm turbo test --force` passed (engine + runner).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
