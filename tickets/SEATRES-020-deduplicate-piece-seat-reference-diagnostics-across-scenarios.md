# SEATRES-020: Deduplicate piece-seat reference diagnostics across scenario loops

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator cross-asset seat reference diagnostic emission
**Deps**: archive/tickets/SEATRES-012-enforce-seat-catalog-references-across-piece-and-scenario-assets.md

## Problem

Validator seat-reference checks currently run per scenario reference and include piece-catalog seat fields in that loop. When multiple scenarios reference the same `(pieceCatalogAssetId, seatCatalogAssetId)` pair, identical diagnostics for the same piece-catalog path are emitted repeatedly, creating noisy/non-minimal diagnostics.

## Assumption Reassessment (2026-03-01)

1. `validateDataAssets()` runs `collectInvalidSeatReferences()` inside a per-scenario loop and includes optional piece-catalog checks in that call.
2. Piece-catalog seat paths are independent of individual scenario payload entries, so repeated scenario iteration can duplicate identical piece-catalog diagnostics.
3. Active tickets `SEATRES-013` through `SEATRES-019` do not cover deduplication of validator seat-reference emissions.

## Architecture Check

1. Deduplicating piece-catalog seat diagnostics by contract pair keeps diagnostics deterministic and minimal.
2. This remains game-agnostic: it only refines cross-asset contract reporting semantics, not game rules.
3. No compatibility aliasing or fallback behavior is introduced.

## What to Change

### 1. Separate scenario-seat and piece-seat validation emission paths

1. Keep scenario seat-field validation per scenario (`initialPlacements`/`outOfPlay`/`seatPools`).
2. Validate piece-catalog seat fields once per unique `(pieceCatalogAssetId, seatCatalogAssetId)` pair.

### 2. Preserve deterministic diagnostics and alternatives

1. Keep existing paths/messages/suggestions stable.
2. Ensure no duplicate diagnostics are emitted for identical path/code combinations.

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)

## Out of Scope

- Compiler seat-catalog selection behavior
- Runtime seat-resolution behavior
- Diagnostic code taxonomy changes

## Acceptance Criteria

### Tests That Must Pass

1. Multiple scenarios sharing the same piece/seat-catalog pair emit each piece-catalog seat-missing diagnostic once.
2. Scenario seat-field diagnostics remain per-scenario as appropriate.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Validator diagnostics remain deterministic and path-precise.
2. Seat-catalog remains the canonical seat source for cross-asset seat references.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add multi-scenario shared-piece-catalog case asserting no duplicate piece-catalog seat diagnostics.  
Rationale: locks deterministic non-duplicated validator output.
2. `packages/engine/test/unit/validate-spec-scenario.test.ts` — keep per-scenario seat-field checks asserting scenario-level emissions still occur.  
Rationale: preserves intended scenario-path coverage.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
