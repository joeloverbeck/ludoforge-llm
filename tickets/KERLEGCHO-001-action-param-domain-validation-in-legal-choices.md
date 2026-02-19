# KERLEGCHO-001: Action Param Domain Validation in `legalChoices*`

**Status**: PENDING
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

## What to Change

**Files (expected)**:
- `packages/engine/src/kernel/legal-choices.ts`
- `packages/engine/src/kernel/legal-moves.ts` (only if shared helper extraction touches this path)
- `packages/engine/src/kernel/apply-move.ts` (only if shared helper extraction is done in this ticket)
- `packages/engine/test/unit/kernel/legal-choices.test.ts`

Implement declared action param validation in `legalChoices*` before accepting a provided param as resolved:

1. For each declared param present in `partialMove.params`, validate membership against `param.domain` using the same normalization and membership semantics as `applyMove` declared-param validation.
2. If the provided value is out-of-domain or invalidly encoded, do not return `complete`.
3. Fail deterministically with the same runtime validation posture used by legal choices for invalid selections (throw vs illegal result) and document the chosen contract in tests.
4. Preserve ordering: unresolved declared params are still surfaced before effect-driven decisions.

## Invariants

1. `legalChoicesDiscover` and `legalChoicesEvaluate` must not return `complete` when any provided declared action param is out-of-domain.
2. Declared param domain checks in `legalChoices*` must match `applyMove` declared-param acceptance criteria for the same `GameDef`/state/move.
3. Valid declared params continue to allow progression to next unresolved param or effect-driven pending choice.
4. Game-specific rules are not hardcoded; validation remains generic over `OptionsQuery`.

## Tests

1. **Unit (`legal-choices`)**: out-of-domain provided declared param for `intsInRange` fails deterministically (assert exact contract).
2. **Unit (`legal-choices`)**: out-of-domain provided declared param for non-int query (`enums` or `zones`) fails deterministically.
3. **Unit (`legal-choices`)**: valid provided declared param continues to next pending decision/completion as expected.
4. **Parity unit**: for the same invalid declared param, `legalChoices*` and `applyMove` both reject (no `legalChoices*` false-complete).
5. **Regression**: existing `packages/engine/test/unit/kernel/legal-choices.test.ts` suite remains green.

