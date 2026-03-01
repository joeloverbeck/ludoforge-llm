# SEATRES-024: Extract shared data-asset selection policy for compiler and validator

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared CNL selection policy module + call-site migration
**Deps**: tickets/SEATRES-023-align-validator-map-piece-selection-with-compiler-inference.md

## Problem

Selection logic is currently duplicated across compile and validate flows. This duplication already produced drift once (compiler ambiguity surfaced while validator remained permissive). Without a shared policy module, selection semantics will diverge again.

## Assumption Reassessment (2026-03-01)

1. Compiler uses `selectAssetById()` with scenario-aware gating for `map`/`pieceCatalog`/`seatCatalog`.
2. Validator currently reimplements partial checks (missing explicit references; selective seat checks) with a different control flow.
3. No active ticket defines a generic shared policy artifact for all scenario-linked asset kinds.

## Architecture Check

1. A single selection-policy module is cleaner than duplicated branching and prevents future contract drift.
2. Policy is game-agnostic and belongs in CNL infrastructure: it reasons over asset ids/kinds, not game rules.
3. No compatibility aliases are introduced; strict, explicit, deterministic selection remains the contract.

## What to Change

### 1. Introduce shared asset-selection policy helper

1. Add a reusable helper for scenario-linked asset selection (`map`, `pieceCatalog`, `seatCatalog`).
2. Encapsulate explicit selector lookup, single-asset inference, ambiguity, and missing-ref handling.
3. Keep diagnostics pluggable by dialect (compiler vs validator code/message envelopes) while sharing decision logic.

### 2. Migrate compiler and validator call sites to helper

1. Replace compile-path ad hoc selection branching with helper usage.
2. Replace validator-path selection checks with helper usage for parity.
3. Remove redundant local branching once helper is authoritative.

## Files to Touch

- `packages/engine/src/cnl/` (add shared selection-policy module)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)

## Out of Scope

- Runtime/kernel asset loading behavior
- Game-specific schema/payload semantics
- Visual config / runner concerns

## Acceptance Criteria

### Tests That Must Pass

1. Compiler and validator produce parity outcomes for selection success/failure across `map`/`pieceCatalog`/`seatCatalog`.
2. Removing one call-site branch does not change intended diagnostics beyond documented parity fixes.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. One canonical selection decision policy governs all scenario-linked data assets.
2. Diagnostic dialect differences do not change underlying selection semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add parity matrix cases for selector present/missing/ambiguous/missing-ref.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — mirror matrix expectations for compile path.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`
