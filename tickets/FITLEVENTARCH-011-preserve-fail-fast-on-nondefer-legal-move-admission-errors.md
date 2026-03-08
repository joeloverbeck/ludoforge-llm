# FITLEVENTARCH-011: Preserve fail-fast on non-deferrable legal-move admission errors

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel decision-sequence admission helper + legal-move error-path tests
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-010-canonical-legal-move-decision-policy-surface.md

## Problem

`isMoveDecisionSequenceAdmittedForLegalMove(...)` currently catches all errors from decision-sequence classification and returns `shouldDeferMissingBinding(error, context)` directly. This can silently convert non-deferrable runtime/spec errors into `false` (move excluded) instead of rethrowing.

That weakens fail-fast runtime contracts and can mask invalid engine/spec behavior.

## Assumption Reassessment (2026-03-08)

1. `packages/engine/src/kernel/move-decision-sequence.ts` currently catches classification errors in `isMoveDecisionSequenceAdmittedForLegalMove(...)` and does not rethrow when defer policy returns `false`.
2. Before canonicalization, event-path policy in `legal-moves.ts` rethrew non-deferrable errors and only normalized deferrable missing-binding cases.
3. Mismatch + correction: canonical helper should preserve prior fail-fast behavior. Only deferrable failures may normalize to admissible-unknown behavior; all non-deferrable errors must throw.

## Architecture Check

1. Canonicalization is only robust if semantic behavior is preserved; silent exclusion on non-deferrable errors is less reliable than explicit failure.
2. This remains kernel/runtime policy work and stays fully game-agnostic (no GameSpecDoc/game-specific branching, no visual-config coupling).
3. No compatibility aliases/shims: helper contract is hardened directly and callsites consume the strict canonical behavior.

## What to Change

### 1. Harden canonical helper error semantics

Update `isMoveDecisionSequenceAdmittedForLegalMove(...)` so:
- `unsatisfiable` => return `false`
- deferrable missing-binding failure => return `true`
- any non-deferrable failure => rethrow original error

### 2. Add targeted regression tests for throw-preservation

Add tests that fail if canonical helper or event legal-move path suppresses non-deferrable classification errors.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Event payload ownership/schema tickets (`FITLEVENTARCH-004/005/006`)
- Runner/UI behavior or visual-config changes
- GameSpecDoc data migrations

## Acceptance Criteria

### Tests That Must Pass

1. Non-deferrable decision-sequence classification errors are rethrown by canonical legal-move admission helper.
2. Deferrable missing-binding failures still normalize to admitted legal-move candidates.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Kernel legal-move admission remains fail-fast for invalid/non-deferrable runtime/spec states.
2. GameDef/simulation/kernel remain game-agnostic and independent from GameSpecDoc/visual-config game-specific data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — add helper contract test asserting non-deferrable errors throw.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add event-path regression proving canonical helper path preserves throw behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
