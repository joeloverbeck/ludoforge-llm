# FITLRULES2-009: Make Turn-Flow Action Class Explicit And Compile-Validated

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — GameSpecDoc compile contract + kernel classification path
**Deps**: FITLRULES2-007

## Problem

Turn-flow option-matrix enforcement currently infers class from `actionId` in some paths while other paths rely on `move.actionClass` semantics. This split is brittle and can drift as action naming/pipeline patterns evolve.

## Assumption Reassessment (2026-02-23)

1. `move.actionClass` already exists on move shape and is used by some turn-flow/free-op code paths.
2. Option-matrix class resolution currently derives from `actionId` via `resolveTurnFlowActionClass`.
3. Mismatch: legality-critical classification is partly implicit/naming-based instead of explicit contract-driven.

## Architecture Check

1. Explicit action-class contracts are cleaner and more extensible than relying on action ID naming conventions.
2. Compiler-validated action class metadata keeps GameSpecDoc as the source of game-specific policy while kernel stays generic.
3. No backwards-compat layer: require explicit classification for card-driven legality-critical actions and fail compile when missing.

## What to Change

### 1. Introduce/require explicit action-class mapping for turn-flow legality

Define the canonical source for action-class classification at compile time and ensure it is available at runtime for matrix checks.

### 2. Remove/retire ID-based fallback classification for matrix enforcement

Matrix checks must consume explicit class metadata, not inferred action IDs.

### 3. Add validation diagnostics

Emit deterministic compile diagnostics when required action-class declarations are missing/invalid for card-driven turn-flow contexts.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/compile-turn-flow.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/integration/fitl-option-matrix.test.ts` (modify)

## Out of Scope

- Any visual presentation schema changes (`visual-config.yaml`).
- FITL-specific engine branching.

## Acceptance Criteria

### Tests That Must Pass

1. Card-driven specs with missing required action-class mapping fail with clear diagnostics.
2. Matrix enforcement uses explicit class metadata in runtime checks.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Turn-flow legality classification is explicit, compile-validated, and game-agnostic.
2. No runtime reliance on action-id naming conventions for matrix legality.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec.test.ts` — class contract validation cases.
2. `packages/engine/test/unit/compile-top-level.test.ts` — compile-lowering/diagnostic assertions.
3. `packages/engine/test/integration/fitl-option-matrix.test.ts` — runtime matrix behavior via explicit class contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
