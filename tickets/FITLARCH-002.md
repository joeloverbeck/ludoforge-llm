# FITLARCH-002: Unify Card-Boundary Lifecycle Consumption in Turn-Flow Runtime

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel turn-flow lifecycle and phase advance integration
**Deps**: None

## Problem

A stale `pendingCardBoundaryTraceEntries` condition was fixed by pre-clearing stored entries before applying a new boundary. This prevents incorrect boundary short-circuiting, but the current design still relies on deferred boundary trace storage/consumption across multiple code paths, which is fragile and easy to regress.

## Assumption Reassessment (2026-02-24)

1. Engine tests currently pass, including FITL playbook golden.
2. Card-boundary execution currently occurs both in eligibility post-move flow and in `advancePhase` via deferred `pendingCardBoundaryTraceEntries` behavior.
3. Mismatch: boundary lifecycle semantics are split across paths; correction: adopt a single canonical boundary-consumption model to avoid stale state and trace/expiry coupling issues.

## Architecture Check

1. A single boundary lifecycle path is cleaner and more robust than storing transient trace payload in runtime state.
2. This remains fully game-agnostic: no FITL-specific branches or identifiers in kernel behavior.
3. No backwards-compatibility shims; migrate directly to the unified lifecycle model.

## What to Change

### 1. Refactor boundary execution ownership

Choose one owner for boundary application/trace emission and remove duplicate deferred-consumption mechanics.

### 2. Remove or minimize transient runtime trace storage

Eliminate `pendingCardBoundaryTraceEntries` from normal runtime flow (or constrain it to a tightly defined, single-step lifecycle).

### 3. Preserve lasting-effect expiry correctness

Ensure turn/round/cycle boundary resolution still receives accurate lifecycle signals for effect expiration.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/turn-flow-lifecycle.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify, if runtime shape changes)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add tests)
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` (modify/add tests as needed)

## Out of Scope

- FITL scenario/data edits.
- Runner presentation behavior.

## Acceptance Criteria

### Tests That Must Pass

1. New regression test proves no stale boundary trace reuse across successive card transitions.
2. Lasting-effect boundary expiry behavior remains correct at turn end and coup handoff.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card-boundary lifecycle has one canonical consumption path.
2. Kernel/runtime remains game-agnostic and free of FITL-specific behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — boundary lifecycle + trace consumption invariants.
2. `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts` (or new focused integration test) — stale pending-boundary regression.
3. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` — confirm no behavioral drift.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`
