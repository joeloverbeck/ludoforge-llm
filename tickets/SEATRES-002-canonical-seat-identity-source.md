# SEATRES-002: Canonical seat identity source and cross-surface consistency diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler core + diagnostics (`compiler-core.ts`, `compile-turn-flow.ts`, `compile-data-assets.ts`, `compile-lowering.ts`, `compiler-diagnostic-codes.ts`)
**Deps**: archive/tickets/SEATRES-001-universal-seat-name-resolution.md

## Problem

Seat-name selector resolution currently depends on `seatIds` sourced from `derivedFromAssets.seats` in compiler core. But seat identity also exists in turn-flow (`turnOrder.config.turnFlow.eligibility.seats`).

This creates a split-brain risk:

1. Selector resolution can fail when turn-flow seats exist but piece-catalog seats are absent.
2. Selector resolution can silently use one seat list while turn execution semantics use another.
3. No explicit diagnostic currently enforces seat identity consistency when both sources exist.

The compiler should expose one canonical, deterministic seat identity list and enforce consistency across all seat surfaces.

## Assumption Reassessment (2026-03-01)

1. `compiler-core.ts` currently computes selector `seatIds` only from `derivedFromAssets.seats?.map((s) => s.id)`.
2. Turn-flow seat order is lowered independently from `turnFlow.eligibility.seats` and is not currently reconciled with selector `seatIds`.
3. Seat-name lowering introduced by SEATRES-001 is compiler-wide, so unresolved or divergent seat identity now has broader behavioral impact.
4. No active ticket in `tickets/*` covers canonicalization/consistency of seat identity across turn-flow and data assets.

## Architecture Check

1. A single canonical seat identity source in compiler core is cleaner than implicit precedence spread across modules.
2. Consistency checks remain game-agnostic: they validate structural identity contract, not game rules.
3. No compatibility shims: mismatched seat surfaces should fail with explicit diagnostics, not fallback behavior.

## What to Change

### 1. Introduce canonical seat identity derivation in compiler core

Add a dedicated helper that derives seat identity from all available seat surfaces:

1. `turnOrder.config.turnFlow.eligibility.seats` (when present)
2. `derivedFromAssets.seats`

Define and document deterministic precedence and merge rules (strict, no aliasing).

### 2. Enforce strict consistency when multiple seat surfaces are present

When both sources are present, validate identical membership and ordering. Emit compiler diagnostics on mismatch with actionable paths.

Examples of mismatch to fail:

1. same members, different order
2. missing/extra seats on either side
3. case-only differences if canonical contract is case-sensitive

### 3. Feed only canonical seat identity into lowering contexts

Replace direct `derivedFromAssets.seats` usage for selector lowering with canonical seat ids from step 1.

### 4. Add explicit diagnostic code(s)

Add one or more compiler diagnostic codes for seat identity mismatch and include deterministic messages/suggestions.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/compile-turn-flow.ts` (modify if helper extraction is needed)
- `packages/engine/test/unit/compile-actions.test.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify)
- `packages/engine/test/integration/*` (modify/add targeted integration only if unit coverage is insufficient)

## Out of Scope

- Runtime/kernel seat resolution behavior changes
- Visual config (`visual-config.yaml`) concerns
- Seat alias migration layers

## Acceptance Criteria

### Tests That Must Pass

1. When only turn-flow seats exist, seat-name selectors compile using those seat ids.
2. When only data-asset seats exist, seat-name selectors compile using those seat ids.
3. When both exist and differ, compile fails with deterministic seat-consistency diagnostics.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Compiler publishes one canonical seat identity list for selector lowering.
2. GameDef/runtime remain game-agnostic; no game-specific branching introduced.
3. No aliasing/back-compat fallback between seat surfaces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-actions.test.ts` — verify actor/executor/terminal seat-name lowering works from canonical seat source.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — verify mismatch diagnostics when turn-flow and data-asset seats diverge.
3. `packages/engine/test/unit/compile-conditions.test.ts` — verify canonical seats are used by owner/pvar selector lowering.

### Commands

1. `node --test packages/engine/dist/test/unit/compile-actions.test.js`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
