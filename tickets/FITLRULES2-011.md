# FITLRULES2-011: Make Turn-Flow Class Resolution Authoritative to GameDef Mapping

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — move legality/apply paths and turn-flow class resolution
**Deps**: `specs/00-fitl-implementation-order.md`, `reports/fire-in-the-lake-rules-section-2.md`

## Problem

Current turn-flow class resolution still prioritizes `move.actionClass` when present. That allows external move payloads to override canonical class mapping in `turnFlow.actionClassByActionId`, which weakens legality invariants.

## Assumption Reassessment (2026-02-23)

1. `resolveTurnFlowActionClass` currently returns `move.actionClass` before consulting GameDef map.
2. Turn-flow legality, interrupt selectors, and free-operation matching all depend on the resolved class.
3. Mismatch correction: class source of truth must be GameDef mapping; move payload class should not override core semantics.

## Architecture Check

1. Canonical class resolution from GameDef is cleaner than dual-authority resolution (`move.actionClass` vs mapping), reducing ambiguity and exploit surface.
2. This preserves the boundary: game-specific classification lives in `GameSpecDoc` -> `GameDef`, while simulation logic remains generic.
3. No backwards-compatibility aliasing: mismatched submitted class is invalid (or ignored deterministically, per chosen enforcement).

## What to Change

### 1. Make mapping authoritative

Refactor turn-flow class resolution so class is derived from `turnFlow.actionClassByActionId[actionId]` for card-driven rules.

### 2. Enforce mismatch policy

When a move includes `actionClass` that conflicts with mapping, fail legality/apply deterministically with explicit diagnostics/reason.

### 3. Tighten move-input contract handling

Ensure legality and apply paths do not rely on caller-provided class to determine turn-flow semantics.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/terminal.test.ts` (modify)

## Out of Scope

- Reworking action pipeline architecture
- UI/request payload schema redesign in runner
- FITL content redesign

## Acceptance Criteria

### Tests That Must Pass

1. Submitted `move.actionClass` cannot override mapped class semantics.
2. Conflicting class submissions are rejected (or deterministically normalized) per selected strict policy.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card-driven class resolution has one source of truth: GameDef turn-flow map.
2. Runtime remains game-agnostic; no game-specific conditionals introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/legal-moves.test.ts` — class-mismatch legality cases.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — card-driven option-matrix behavior with conflicting incoming class.
3. `packages/engine/test/unit/terminal.test.ts` — apply/illegal reason path for mismatched class input.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`
