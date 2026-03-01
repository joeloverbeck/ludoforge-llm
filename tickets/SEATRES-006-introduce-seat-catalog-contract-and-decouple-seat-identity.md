# SEATRES-006: Introduce explicit SeatCatalog contract and decouple seat identity from piece/turn-flow structures

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — schema + compiler + migration tooling + fixture/spec migration
**Deps**: archive/tickets/SEATRES-005-strict-single-seat-namespace-and-spec-migration.md

## Problem

Seat identity is currently inferred from surfaces that have different responsibilities:

1. `turnFlow.eligibility.seats` (turn-order behavior)
2. `pieceCatalog.seats` (piece ownership catalog)

Using either as an implicit source of truth couples unrelated domains and makes extensions fragile (seat metadata, seat groups, ordering policy, AI hints, etc.).

## Assumption Reassessment (2026-03-01)

1. The compiler currently derives seat identity by reconciling turn-flow and piece-catalog inputs, meaning seat identity has no first-class contract.
2. Existing tests primarily verify resolution behavior, not a dedicated seat schema boundary.
3. Current repository data/spec fixtures rely on embedded seat declarations inside piece/turn-flow structures.
4. No active ticket defines a first-class `SeatCatalog` schema contract with explicit migration from embedded seat declarations.

## Architecture Check

1. A first-class `SeatCatalog` is the robust/extensible boundary: seat identity and metadata become explicit, versionable game data.
2. Turn-flow and piece-catalog should reference seat ids, not define seat identity.
3. This reinforces game-agnostic engine design: compiler/kernel consume generic seat contracts without game-specific branching.
4. No backward compatibility: embedded seat-definition paths are removed after migration.

## What to Change

### 1. Add explicit seat catalog to GameSpecDoc contract

1. Add a dedicated seat catalog surface (for example `dataAssets` entry with `kind: seatCatalog` or top-level equivalent) that defines canonical seat ids and optional seat metadata.
2. Update schema artifacts and validators so this is the only place seat identity is declared.

### 2. Refactor compiler to consume SeatCatalog only for seat identity

1. Update seat-identity contract module to read canonical seat ids exclusively from `SeatCatalog`.
2. Treat `turnFlow.eligibility.seats`, piece ownership, terminal refs, and event refs as consumers that must reference existing catalog ids.
3. Remove legacy inference paths that read seat identities out of piece-catalog or turn-flow declarations.

### 3. Migrate specs/fixtures and add migration tooling

1. Add/extend a migration utility that rewrites existing specs with embedded seat identities into explicit `SeatCatalog`.
2. Migrate repository fixtures and game docs/spec sources accordingly.
3. Update any golden outputs that intentionally change because seat identity source moved.

## Files to Touch

- `packages/engine/schemas/GameSpecDoc.schema.json` (or schema source + generated artifacts)
- `packages/engine/src/cnl/seat-identity-contract.ts`
- `packages/engine/src/cnl/compiler-core.ts`
- `packages/engine/src/cnl/cross-validate.ts`
- `packages/engine/src/cnl/expand-data-assets.ts` (if seat catalog participates in expansion)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts`
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
3. `packages/engine/test/integration/compile-fixture.test.ts` (or equivalent) — compile migrated fixtures that include `SeatCatalog` and no legacy seat-definition paths.
Rationale: validates real-world migration outcomes, not only synthetic unit docs.
4. `packages/engine/test/e2e/**` relevant seat/turn-flow scenarios — refresh expected outputs where seat contract source changes.
Rationale: confirms end-to-end behavior remains stable after contract relocation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
4. `pnpm -F @ludoforge/engine test:all`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
