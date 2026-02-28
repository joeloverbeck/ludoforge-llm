# ENGINEARCH-143: Free-Operation Preflight Overlay Single-Constructor Contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel free-operation preflight context construction ownership
**Deps**: archive/tickets/ENGINEARCH-135-apply-move-free-operation-preflight-zone-filter-contract-parity.md, archive/tickets/ENGINEARCH-136-canonical-free-operation-analysis-api-without-legacy-overlaps.md, tickets/ENGINEARCH-142-free-operation-denial-precedence-parity-before-pipeline-preflight.md

## Problem

Free-operation preflight context overlay fields (`executionPlayerOverride`, `freeOperationZoneFilter`, diagnostics payload) are currently assembled at multiple call sites (`applyMove`, `legalChoicesDiscover`). This duplication increases drift risk for strict/discovery parity and makes future policy extensions fragile.

## Assumption Reassessment (2026-02-28)

1. Both strict and discovery surfaces now thread free-operation preflight context into `resolveActionApplicabilityPreflight`, but assembly logic is duplicated per surface.
2. The duplicated overlay construction currently uses different local shapes and surface wiring responsibilities, requiring parallel edits for contract changes.
3. Mismatch: ownership is still spread across call sites; corrected scope is to centralize overlay construction into one kernel helper with explicit surface input.

## Architecture Check

1. A single constructor for free-operation preflight overlay is cleaner and more extensible than duplicated object assembly logic.
2. This is game-agnostic kernel plumbing only and does not introduce game-specific behavior into runtime/simulator.
3. No backwards-compatibility aliasing/shims: migrate call sites to one canonical constructor and remove duplicate assembly paths.

## What to Change

### 1. Introduce a canonical free-operation preflight overlay builder

Create a helper that accepts canonical analysis + surface identity and returns preflight overlay fields suitable for `resolveActionApplicabilityPreflight`.

### 2. Migrate strict/discovery call sites

Update `applyMove` and `legalChoicesDiscover` to consume the shared builder instead of manual overlay assembly.

### 3. Add contract tests for overlay construction

Add focused tests (or strengthen existing ones) that fail if required overlay fields drift by surface.

## Files to Touch

- `packages/engine/src/kernel/` (add helper file for overlay builder)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/kernel/` (modify/add focused overlay contract tests)

## Out of Scope

- Free-operation denial taxonomy changes.
- Turn-flow gameplay semantics changes.
- Any GameSpecDoc or visual-config changes.

## Acceptance Criteria

### Tests That Must Pass

1. Strict and discovery preflight overlay fields are produced by one canonical constructor.
2. Required overlay fields remain parity-locked across surfaces for equivalent analysis input.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation preflight overlay contract has one ownership point in kernel code.
2. Engine/runtime remains game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/*` (new/updated overlay contract tests) — assert canonical constructor output by surface.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` / `legal-choices.test.ts` — ensure call-site behavior remains unchanged after consolidation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
