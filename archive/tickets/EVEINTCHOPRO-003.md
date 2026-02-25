# EVEINTCHOPRO-003: Reassess and harden event integration tests for template workflow

**Status**: ✅ COMPLETED  
**Spec**: 50 (Event Interactive Choice Protocol)  
**Priority**: High  
**Depends on**: EVEINTCHOPRO-001  
**Blocks**: EVEINTCHOPRO-005

## Reassessment Summary

This ticket's original assumptions were partially stale versus the current codebase.

### Confirmed discrepancies

1. `packages/engine/src/kernel/legal-moves.ts` already emits base event template moves and uses `isMoveDecisionSequenceSatisfiable(...)`; the pre-resolution path is already removed.
2. The helper path/function name in this ticket was outdated:
   - Not `agents/template-completion.ts`
   - Current API is `completeTemplateMove(...)` in `packages/engine/src/kernel/move-completion.ts`
3. `RandomAgent` and `GreedyAgent` already complete templates (including event templates with non-empty base params) by calling `completeTemplateMove(...)` directly on legal moves.
4. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` is already migrated and now explicitly asserts template-first behavior.
5. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` and `fitl-card-flow-determinism.test.ts` do not rely on `legalMoves()`-derived event templates for the event move under test; they construct concrete event moves intentionally and are not direct migration targets.
6. `packages/engine/test/unit/apply-move.test.ts` event applications in the cited region validate non-chooseOne event behavior and dynamic decision validation; they are not blanket migration misses.

## Architectural Decision

The current architecture is better than the ticket's original proposed direction and should be preserved:

- Keep `legalMoves()` as a template emitter for interactive decisions.
- Keep completion responsibility in `move-completion.ts` and agent selection logic.
- Do not add aliases or compatibility shims around old pre-resolved event behavior.

This separation is cleaner and more extensible: enumeration is deterministic and generic, while decision completion remains a composable layer reusable by agents/tests/UI.

## Updated Scope

This ticket now focuses on **test hardening and verification** where event moves are still applied directly from `legalMoves()`:

1. Audit the originally listed files and keep only true migration candidates.
2. For applicable tests, assert whether the selected event move is `complete` or `pending` via `legalChoicesEvaluate(...)`.
3. If `pending`, complete using `completeTemplateMove(...)` before `applyMove(...)`.
4. Preserve test intent and state assertions; do not change game semantics.

## File List (Revised)

| File | Change |
|------|--------|
| `packages/engine/test/integration/fitl-commitment-phase.test.ts` | Harden event application path to be template-safe and explicit about completion state |
| `packages/engine/test/integration/fitl-commitment-targeting-rules.test.ts` | Harden event application path to be template-safe and explicit about completion state |

No ticket-driven code changes are required for:
- `fitl-events-tutorial-gulf-of-tonkin.test.ts` (already migrated)
- `fitl-turn-flow-golden.test.ts` (uses explicit move fixture by design)
- `fitl-card-flow-determinism.test.ts` (uses explicit move fixture by design)
- `unit/apply-move.test.ts` cited block (not an event-template migration gap)

## Acceptance Criteria (Revised)

1. Relevant hardened tests pass with current template architecture.
2. Existing Gulf of Tonkin template tests continue passing.
3. No changes to kernel event enumeration architecture or compatibility aliases.
4. Engine test suite remains green for targeted files plus broader verification run.

## Verification Plan

Run at minimum:

- `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-commitment-phase.test.ts`
- `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-commitment-targeting-rules.test.ts`
- `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`

Then run broader confidence checks:

- `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-02-25
- Actually changed:
  - Reassessed ticket assumptions against current code and corrected stale claims.
  - Narrowed scope to real remaining work: template-safe hardening for `fitl-commitment-phase` and `fitl-commitment-targeting-rules`.
  - Updated those two tests to probe `legalChoicesEvaluate(...)` and complete with `completeTemplateMove(...)` only when pending.
- Deviations from original plan:
  - No changes were needed in `legal-moves.ts`, agents, simulator, `fitl-turn-flow-golden`, `fitl-card-flow-determinism`, or the cited `unit/apply-move` block because they were already aligned with Spec 50 behavior.
- Verification results:
  - Targeted tests passed:
    - `fitl-commitment-phase.test.ts`
    - `fitl-commitment-targeting-rules.test.ts`
    - `fitl-events-tutorial-gulf-of-tonkin.test.ts`
  - Full engine suite passed: `271/271`.
  - Engine lint passed: `pnpm -F @ludoforge/engine lint`.
