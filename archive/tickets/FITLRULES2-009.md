# FITLRULES2-009: Make Turn-Flow Action Class Explicit And Compile-Validated

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — GameSpecDoc compile contract + kernel classification path
**Deps**: FITLRULES2-007

## Problem

Turn-flow option-matrix enforcement still allows implicit classification paths:

1. `resolveTurnFlowActionClass` falls back to `actionId` string matching when `move.actionClass` is absent.
2. `legalMoves` can synthesize `move.actionClass` variants from matrix constraints when base moves are unclassified.

This is brittle and can drift as action IDs or pipeline patterns evolve.

## Assumption Reassessment (2026-02-23)

1. `move.actionClass` exists and is already threaded in runtime bindings and several turn-flow paths.
2. `resolveTurnFlowActionClass` currently infers class from `actionId` as fallback.
3. `turnFlow` schema/validator currently has no explicit `actionId -> actionClass` contract.
4. Cross-validation currently validates `freeOperationActionIds` and pivotal selector action IDs against declared actions, but does not validate turn-flow class mapping references (because no mapping exists yet).
5. Production FITL turn-flow currently relies on implicit classing and must be updated if explicit mapping becomes required.

## Architecture Check

1. Explicit compiler-validated class metadata in `turnFlow` is cleaner and more extensible than ID naming inference.
2. Kernel legality should consume explicit metadata or explicit move fields only.
3. No backwards-compat aliasing: remove `actionId` naming fallback for legality classification.
4. Keep kernel generic and game-agnostic; class policy remains authored in `GameSpecDoc`.

## What to Change

### 1. Introduce explicit turn-flow action classification contract

Add an explicit turn-flow mapping from action ID to action class in GameSpecDoc and lowered runtime turn-flow config.

### 2. Compile/validate/cross-validate the mapping

Validate shape, allowed class values, and unknown action references with deterministic diagnostics.

### 3. Route runtime classification through explicit metadata

Replace `actionId` naming fallback in `resolveTurnFlowActionClass` with explicit mapping lookup (with `move.actionClass` override still allowed).

### 4. Tighten option-matrix enforcement behavior

Ensure matrix checks operate on explicit classes only. Unclassified moves must not pass legality-critical matrix gating.

### 5. Update production FITL turn-flow authored data

Populate the new explicit mapping in `data/games/fire-in-the-lake/30-rules-actions.md` to preserve intended legality behavior under strict classification.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/validate-spec-shared.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/compile-turn-flow.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/integration/fitl-option-matrix.test.ts` (modify)

## Out of Scope

- Any visual presentation schema changes (`visual-config.yaml`).
- FITL-specific kernel branching.

## Acceptance Criteria

### Tests That Must Pass

1. Card-driven specs with missing/invalid explicit action-class mapping fail with clear diagnostics.
2. Matrix enforcement uses explicit class metadata (`move.actionClass` or turn-flow mapping), never action-ID naming inference.
3. Production FITL compile + relevant turn-flow matrix integration tests remain green.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Turn-flow legality classification is explicit, compile-validated, and game-agnostic.
2. No runtime reliance on action-ID naming conventions for matrix legality.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec.test.ts` — turn-flow mapping shape/value diagnostics.
2. `packages/engine/test/unit/compile-top-level.test.ts` — compile + xref diagnostics for mapping contracts.
3. `packages/engine/test/integration/fitl-option-matrix.test.ts` — production matrix behavior under explicit mapping.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-23
- What changed:
  - Added explicit `turnFlow.actionClassByActionId` to GameSpecDoc/runtime turn-flow contracts.
  - Added validator/compiler diagnostics for missing/invalid action-class maps, plus cross-reference validation for unknown mapped action IDs.
  - Removed action-id naming fallback from runtime class resolution; classing now uses `move.actionClass` or explicit turn-flow mapping.
  - Legal move emission now stamps explicit `actionClass` when resolvable from mapping, making option-matrix classification deterministic and explicit.
  - Updated FITL production turn-flow authored data to declare explicit action-class mappings.
  - Updated and expanded unit/integration coverage, plus refreshed affected golden fixtures.
- Deviations from original plan:
  - Additional fixture/golden updates were required beyond the initial file list to keep determinism and cross-validate suites aligned with the stricter contract.
  - Runtime resolution now tolerates missing mapping objects without crashing in direct GameDef fixtures, while still enforcing explicit map requirements at compile/validation boundaries.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (253/253).
  - `pnpm -F @ludoforge/engine lint` passed.
