# FITLARCH-002: Unify Card-Boundary Lifecycle Consumption in Turn-Flow Runtime

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel turn-flow lifecycle and phase advance integration
**Deps**: None

## Problem

A stale `pendingCardBoundaryTraceEntries` condition was fixed by pre-clearing stored entries before applying a new boundary. This prevents incorrect boundary short-circuiting, but the current design still relies on deferred boundary trace storage/consumption across multiple code paths, which is fragile and easy to regress.

## Assumption Reassessment (2026-02-24)

1. Card-boundary execution currently occurs in two places: eligibility post-move flow and `advancePhase` turn-end flow.
2. Runtime currently stores `pendingCardBoundaryTraceEntries` as deferred handoff state between those paths.
3. Existing `fitl-eligibility-pass-chain` coverage does not explicitly exercise stale deferred-boundary reuse with real card-lifecycle zones.
4. Mismatch: boundary lifecycle and boundary-expiry semantics are split across paths and coupled via transient trace state; correction: adopt one canonical boundary-resolution flow per boundary occurrence, with immediate expiry evaluation at the same execution point.

## Architecture Check

1. A single boundary lifecycle-resolution path (per boundary occurrence) is cleaner and more robust than storing transient trace payload in runtime state.
2. This remains fully game-agnostic: no FITL-specific branches or identifiers in kernel behavior.
3. No backwards-compatibility shims; migrate directly to the unified lifecycle model.

## What to Change

### 1. Refactor boundary execution ownership

Choose one owner for boundary application/trace emission at eligibility-driven card end, and remove deferred-consumption mechanics that replay lifecycle trace later in `advancePhase`.

### 2. Remove or minimize transient runtime trace storage

Eliminate `pendingCardBoundaryTraceEntries` from runtime state and all related pre-clear/deferred-consumption branches.

### 3. Preserve lasting-effect expiry correctness

Ensure turn/round/cycle boundary resolution for lasting-effect expiration executes at the same point the boundary is resolved (no delayed dependency on later phase advancement).

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/turn-flow-lifecycle.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify, if runtime shape changes)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add tests)
- `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts` (modify/add focused regression)
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` (modify only if behavior contract intentionally changes)

## Out of Scope

- FITL scenario/data edits.
- Runner presentation behavior.

## Acceptance Criteria

### Tests That Must Pass

1. New regression test proves no stale boundary trace reuse across successive card transitions.
2. Lasting-effect boundary expiry behavior remains correct at the actual boundary-resolution point, including turn end and coup handoff.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card-boundary lifecycle has one canonical consumption path.
2. No runtime-level deferred boundary trace cache remains.
3. Boundary-driven lasting-effect expiry is evaluated in lockstep with boundary resolution.
4. Kernel/runtime remains game-agnostic and free of FITL-specific behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — boundary lifecycle + trace consumption invariants.
2. `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts` (or new focused integration test) — stale boundary reuse regression with configured card-lifecycle zones.
3. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` — confirm no behavioral drift (only if fixture update is intentionally required).

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`

## Outcome (2026-02-24)

- Updated assumptions/scope to match actual runtime/test architecture before implementation.
- Removed deferred runtime boundary trace cache (`pendingCardBoundaryTraceEntries`) and related stale-cleanup/deferred-consumption behavior.
- Unified boundary-resolution flow by evaluating lasting-effect boundary expiry at the same point eligibility resolves a card boundary, instead of deferring via runtime trace storage.
- Preserved turn-end boundary behavior in `advancePhase` for boundaries that are actually resolved there.
- Added focused integration regression coverage for successive card-boundary promotion and immediate lasting-effect expiry on eligibility-driven boundary resolution.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
