# KERLEGCHO-001: Action Param Domain Validation in `legalChoices*`

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel legality surface behavior alignment
**Deps**: None

## Problem

`legalChoicesDiscover`/`legalChoicesEvaluate` currently treat any pre-filled declared action param as resolved without validating domain membership. This allows `legalChoices*` to return `complete` for moves that `applyMove` rejects via declared-param validation.

That creates cross-surface inconsistency between:
- legality discovery/evaluation (`legalChoices*`)
- runtime execution validation (`applyMove`)

No backwards compatibility is required; behavior should be tightened.

## Assumption Reassessment (2026-02-19)

1. Confirmed: pre-filled declared action params are currently accepted in `legalChoices*` without domain membership validation.
2. Confirmed: `applyMove` already performs declared-param normalization + membership checks before execution.
3. Correction: legal-choices runtime validation posture for invalid selections is currently fail-fast by throwing runtime validation errors (not returning `illegal`) for validation-contract violations.
4. Scope correction: this ticket should align declared-param domain membership behavior only. Action-param option encodability hardening is covered by `KERLEGCHO-002`, and full cross-surface consolidation is covered by `KERLEGCHO-003`.

## What to Change

**Files (expected)**:
- `packages/engine/src/kernel/legal-choices.ts`
- `packages/engine/src/kernel/apply-move.ts` (adopt shared membership helper to preserve single-source semantics)
- `packages/engine/src/kernel/declared-action-param-domain.ts` (new shared helper for normalization + membership checks)
- `packages/engine/test/unit/kernel/legal-choices.test.ts`

Implement declared action param validation in `legalChoices*` before accepting a provided param as resolved:

1. For each declared param present in `partialMove.params`, validate membership against `param.domain` using the same normalization and membership semantics as `applyMove` declared-param validation.
2. If the provided value is out-of-domain or invalidly encoded, do not return `complete`.
3. Fail deterministically with `LEGAL_CHOICES_VALIDATION_FAILED` (throw), matching legal-choices validation posture for invalid selections.
4. Preserve ordering: unresolved declared params are still surfaced before effect-driven decisions.

## Invariants

1. `legalChoicesDiscover` and `legalChoicesEvaluate` must not return `complete` when any provided declared action param is out-of-domain.
2. Declared param domain checks in `legalChoices*` must match `applyMove` declared-param acceptance criteria for the same `GameDef`/state/move.
3. Valid declared params continue to allow progression to next unresolved param or effect-driven pending choice.
4. Game-specific rules are not hardcoded; validation remains generic over `OptionsQuery`.

## Tests

1. **Unit (`legal-choices`)**: out-of-domain provided declared param for `intsInRange` throws `LEGAL_CHOICES_VALIDATION_FAILED`.
2. **Unit (`legal-choices`)**: out-of-domain provided declared param for non-int query (`enums` or `zones`) throws `LEGAL_CHOICES_VALIDATION_FAILED`.
3. **Unit (`legal-choices`)**: valid provided declared param continues to next pending decision/completion as expected.
4. **Parity unit**: for the same invalid declared param, `legalChoices*` throws `LEGAL_CHOICES_VALIDATION_FAILED` and `applyMove` rejects with move-param illegality (no `legalChoices*` false-complete).
5. **Regression**: existing `packages/engine/test/unit/kernel/legal-choices.test.ts` suite remains green.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Added canonical declared-param domain helper at `packages/engine/src/kernel/declared-action-param-domain.ts`.
  - `legalChoices*` now validates provided declared action params against declared domains and throws `LEGAL_CHOICES_VALIDATION_FAILED` on invalid values.
  - `applyMove` declared-param validation now reuses the same helper for single-source semantics.
  - Added legal-choices coverage for invalid `intsInRange`, invalid `enums`, and legalChoices/applyMove rejection parity.
  - Updated one apply-move subset-constraint test fixture to use domain-valid scalar params.
- **Deviation from original plan**:
  - Introduced helper extraction in this ticket (rather than deferring all consolidation) to prevent immediate drift between legality and execution membership semantics.
  - Did not modify `legal-moves` in this ticket; full cross-surface consolidation remains in `KERLEGCHO-003`.
- **Verification**:
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
