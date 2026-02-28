# ENGINEARCH-148: Free-Operation Compound Pipeline Dispatch Must Share Canonical Preflight Overlay Contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel `applyMove` compound/special-activity pipeline dispatch parity hardening
**Deps**: archive/tickets/ENGINEARCH-143-free-operation-preflight-overlay-single-constructor-contract.md

## Problem

`applyMove` preflight now uses the canonical free-operation overlay constructor, but `resolveMatchedPipelineForMove` still resolves pipeline dispatch through a separate manual eval-context path. This leaves split ownership for free-operation pipeline applicability in compound validation.

## Assumption Reassessment (2026-02-28)

1. Confirmed: validation preflight in `resolveMovePreflightContext` threads free-operation preflight overlay via `buildFreeOperationPreflightOverlay(...)`.
2. Confirmed: `resolveMatchedPipelineForMove(...)` currently computes `executionPlayer` and pipeline dispatch directly, without canonical overlay threading (`freeOperationZoneFilter` + diagnostics).
3. Mismatch: canonical contract ownership is incomplete for free-operation pipeline applicability in `applyMove` auxiliary pipeline lookup. Corrected scope: unify this path with canonical overlay ownership.

## Architecture Check

1. A single free-operation pipeline-applicability construction path is cleaner and more robust than maintaining a second manual dispatch path.
2. This preserves boundaries: no game-specific branching; behavior remains encoded in GameSpecDoc/GameDef data and evaluated by generic kernel logic.
3. No backwards-compatibility aliasing/shims; directly migrate the remaining manual dispatch path.

## What to Change

### 1. Align `resolveMatchedPipelineForMove` with canonical free-operation overlay construction

Refactor the helper so free-operation execution-player and zone-filter applicability flow through canonical overlay ownership (or a shared preflight-context constructor used by both call sites).

### 2. Eliminate duplicate free-operation pipeline applicability wiring

Remove parallel manual wiring in compound/special-activity pipeline lookup when it duplicates canonical preflight contract behavior.

### 3. Add regression tests for overlap path

Add focused unit coverage where free-operation zone filters affect pipeline applicability during compound validation/special-activity constraints.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/free-operation-preflight-overlay.ts` (modify only if API extension is required)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)

## Out of Scope

- Free-operation denial taxonomy changes.
- Turn-flow rules redesign.
- GameSpecDoc or visual-config content/schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. Free-operation pipeline applicability for compound/special-activity validation uses the same canonical overlay contract as preflight.
2. No strict/discovery behavioral regression for existing free-operation legality outcomes.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation preflight overlay ownership is singular across all `applyMove` pipeline-applicability resolution paths.
2. Kernel/runtime/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add case where free-operation `zoneFilter` constrains pipeline applicability in compound/special-activity validation path.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` (existing assertions only) — ensure discovery behavior remains consistent after consolidation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

