# FITLEVENTARCH-004: Event Target Executability Cross-Validate Parity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL cross-validation for event-deck target executability
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, archive/tickets/FITLEVENTARCH-002-choice-validation-error-classification.md

## Problem

After introducing target-owned event effects (`targets[].effects`), cross-validation still treats only side/branch-level `effects|branches|lastingEffects` as executable payload. This can raise false `CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING` errors for canonical target-local event definitions.

## Assumption Reassessment (2026-03-07)

1. `pushEventTargetExecutabilityDiagnostic` in `packages/engine/src/cnl/cross-validate.ts` currently checks executable payload only at scope level and ignores `targets[].effects`.
2. Event execution semantics in kernel now support target-local executable payload via `EventTargetDef.effects` + `application`.
3. Mismatch: validator semantics lag behind runtime semantics; scope must be corrected to consider target-owned payload as executable.

## Architecture Check

1. Validation and runtime contracts must agree; otherwise authors get false negatives and lose trust in tooling.
2. Fix remains game-agnostic and belongs in shared CNL validation logic, not in game data patches.
3. No compatibility aliasing: executability logic should reflect the canonical target contract only.

## What to Change

### 1. Update event target executability checks

Modify cross-validation so target declarations are considered executable when at least one declared target has non-empty `effects`.

### 2. Keep diagnostic semantics deterministic

Preserve existing diagnostic code and message family, but avoid emitting it when target-local executable payload exists.

### 3. Strengthen tests for canonical contract

Add both positive and negative tests:
- positive: `targets[].effects` only should pass executability check
- negative: targets without target effects and without scope effects should still fail

## Files to Touch

- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)

## Out of Scope

- Runtime event execution changes
- Event content balancing or card text updates
- Runner/UI diagnostics formatting

## Acceptance Criteria

### Tests That Must Pass

1. Event sides/branches using only `targets[].effects` do not emit `CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING`.
2. Targets with no executable payload anywhere still emit the diagnostic.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Validator executable-payload semantics match canonical runtime target semantics.
2. Cross-validation remains game-agnostic and reusable across all games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — add positive canonical target-effects executability case.
2. `packages/engine/test/unit/cross-validate.test.ts` — retain/strengthen negative missing-executability case.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
