# FITLRULES2-011: Make Turn-Flow Class Resolution Authoritative to GameDef Mapping

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — move legality/apply paths and turn-flow class resolution
**Deps**: `specs/00-fitl-implementation-order.md`, `reports/fire-in-the-lake-rules-section-2.md`

## Problem

Current turn-flow class resolution still prioritizes `move.actionClass` when present. That allows external move payloads to override canonical class mapping in `turnFlow.actionClassByActionId`, which weakens legality invariants.

## Assumption Reassessment (2026-02-23)

### Verified Current Behavior

1. `resolveTurnFlowActionClass` currently returns `move.actionClass` before consulting GameDef map (`packages/engine/src/kernel/turn-flow-eligibility.ts`).
2. Turn-flow option-matrix gating, interrupt cancellation selectors, and free-operation grant class matching use that resolver (`packages/engine/src/kernel/legal-moves-turn-order.ts`, `packages/engine/src/kernel/turn-flow-eligibility.ts`).
3. `applyMove`/`validateMove` currently do not explicitly reject `move.actionClass` mismatches against `turnFlow.actionClassByActionId` before executing (`packages/engine/src/kernel/apply-move.ts`).

### Corrected Assumptions

1. GameDef `turnFlow.actionClassByActionId` must be authoritative for turn-flow class semantics.
2. Caller-provided `move.actionClass` is metadata only unless it matches mapped class; it must not alter legality or apply behavior.
3. Mismatches must fail deterministically in apply/decision legality paths with explicit reason context.

## Architecture Check

1. Canonical class resolution from GameDef is cleaner than dual-authority resolution (`move.actionClass` vs mapping), reducing ambiguity and exploit surface.
2. This preserves the boundary: game-specific classification lives in `GameSpecDoc` -> `GameDef`, while simulation logic remains generic.
3. No backwards-compatibility aliasing: mismatched submitted class is invalid (or ignored deterministically, per chosen enforcement).

## What to Change

### 1. Make mapping authoritative

Refactor turn-flow class resolution so class is derived from `turnFlow.actionClassByActionId[actionId]` for card-driven rules.

### 2. Enforce mismatch policy

When a move includes `actionClass` that conflicts with mapping, fail deterministically in validation/apply paths with explicit diagnostics/reason context.

### 3. Tighten move-input contract handling

Ensure legality and apply paths do not rely on caller-provided class to determine turn-flow semantics.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/runtime-reasons.ts` (modify)
- `packages/engine/test/unit/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/integration/fitl-option-matrix.test.ts` (modify)

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
3. `packages/engine/test/integration/fitl-option-matrix.test.ts` — apply path rejects class-mismatch submissions in card-driven matrix windows.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-23
- **What changed**:
  - Made turn-flow class resolution authoritative to `turnFlow.actionClassByActionId` for card-driven turn order.
  - Added deterministic mismatch detection between submitted `move.actionClass` and mapped class.
  - Enforced mismatch rejection in `applyMove` with explicit illegal reason metadata.
  - Hardened option-matrix legality checks to reject conflicting submitted class overrides.
  - Added/updated unit and integration tests to lock resolver authority and mismatch rejection behavior.
- **Deviations from original plan**:
  - Replaced `packages/engine/test/unit/terminal.test.ts` coverage target with `packages/engine/test/integration/fitl-option-matrix.test.ts` because this behavior belongs to turn-flow/apply legality, not terminal evaluation.
  - Added `packages/engine/src/kernel/runtime-reasons.ts` updates to provide a dedicated illegal reason for class mismatch.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
