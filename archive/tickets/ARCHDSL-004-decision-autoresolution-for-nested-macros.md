# ARCHDSL-004 - Decision Auto-Resolution for Nested Pipeline Decisions

**Status**: ✅ COMPLETED  
**Priority**: Medium  
**Depends on**: None

## Reassessed assumptions (current codebase)

- `test/helpers/decision-param-helpers.ts` currently performs **name→decisionId aliasing only** for already-provided params. It does not auto-fill unresolved decisions.
- `src/kernel/move-decision-sequence.ts` already provides a generic engine-level decision walker (`resolveMoveDecisionSequence`) that deterministically discovers pending decisions via `legalChoices` and can fill values through a chooser callback.
- Decision-id generation is already centralized and deterministic in `src/kernel/decision-id.ts` (`composeDecisionId`). No additional kernel metadata path changes are required for this ticket.
- `test/integration/fitl-momentum-formula-mods.test.ts` already mixes runtime assertions with some structural assertions. Structural checks should only remain where they validate compile-time contract wiring that runtime cannot uniquely prove.

## 1) What needs to change / be added

Refactor test-side decision auto-resolution to use the existing kernel decision-sequence resolver so nested/macro-expanded decision flows are completed deterministically without brittle manual stitching.

### Required implementation changes

- Rework `test/helpers/decision-param-helpers.ts` to delegate decision completion to `resolveMoveDecisionSequence`.
- Add deterministic default selection behavior for unresolved pending decisions:
  - `chooseOne` -> first option
  - `chooseN` -> first `min` options (or empty array when `min=0`)
- Add helper-level per-decision override support by decision id or decision name pattern (regex/string matcher), while keeping helper logic engine-agnostic.
- Keep compound special-activity handling deterministic by resolving both operation and special-activity moves through the same decision-sequence mechanism.
- In `test/integration/fitl-momentum-formula-mods.test.ts`, replace structural assertions that were compensating for decision-resolution brittleness with runtime assertions where now feasible.

### Expected files to touch (minimum)

- `test/helpers/decision-param-helpers.ts`
- `test/unit/kernel/move-decision-sequence.test.ts`
- `test/integration/fitl-momentum-formula-mods.test.ts`

## 2) Invariants that should pass

- Deterministic decision resolution for the same `def/state/move` and chooser overrides.
- No game-specific branching in helper logic.
- Existing integration tests that use helper-based deterministic resolution remain stable.
- Decision IDs remain deterministic and traceable (`composeDecisionId` behavior unchanged).

## 3) Tests that should pass

### New/updated unit tests

- `test/unit/kernel/move-decision-sequence.test.ts`
  - nested decision sequences (including templated binds) are discovered and resolved in deterministic order.
- helper-focused tests (new or colocated)
  - auto-resolver fills nested pending decisions without name alias pre-seeding.
  - override precedence by decision id/name pattern is deterministic.

### Updated integration tests

- `test/integration/fitl-momentum-formula-mods.test.ts`
  - runtime assertions cover behavior that previously required structural assertions due to incomplete decision auto-resolution.

### Full-suite gates

- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- Completion date: 2026-02-14
- What changed:
  - Refactored `test/helpers/decision-param-helpers.ts` to resolve nested decision sequences through `resolveMoveDecisionSequence` with deterministic defaults.
  - Added helper-level override rules by decision id/name pattern and preserved explicit param precedence.
  - Added dedicated helper coverage in `test/unit/decision-param-helpers.test.ts`.
  - Added nested templated decision-order coverage in `test/unit/kernel/move-decision-sequence.test.ts`.
  - Converted Body Count checks in `test/integration/fitl-momentum-formula-mods.test.ts` from structural macro assertions to runtime behavior checks.
- Deviations from original plan:
  - No kernel decision-id generation changes were made because existing `composeDecisionId` behavior was already deterministic and sufficient.
  - Helper behavior intentionally preserves invalid-script pass-through so `applyMove` emits canonical illegal-move errors expected by integration tests.
- Verification:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
