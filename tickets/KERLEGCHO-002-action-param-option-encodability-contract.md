# KERLEGCHO-002: Action Param Option Encodability Contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — runtime contract hardening for discovery/evaluation outputs
**Deps**: KERLEGCHO-001 (recommended but not strictly required)

## Problem

Action-param pending options in `legalChoices*` are currently built from raw `evalQuery` values with a type cast, without enforcing move-param encodability. Some queries can produce object payloads, causing `pending.options[].value` to violate the move-param contract expected by downstream systems.

Effect-driven choices (`chooseOne`/`chooseN`) already enforce this contract and fail fast when options are not encodable. Declared action params should honor the same generic contract.

No backwards compatibility is required; non-encodable outputs should be rejected.

## What to Change

**Files (expected)**:
- `packages/engine/src/kernel/legal-choices.ts`
- `packages/engine/src/kernel/effects-choice.ts` (only if shared normalizer is extracted here/from here)
- `packages/engine/src/kernel/apply-move.ts` (only if shared value normalizer is consolidated)
- `packages/engine/test/unit/kernel/legal-choices.test.ts`

Enforce canonical move-param encoding for action-param pending options:

1. Normalize/validate each option value from `param.domain` before adding it to pending `options`.
2. If an option is not move-param encodable, fail fast with deterministic runtime validation error (same policy family as effect-choice runtime validation).
3. Remove unsafe casting-only behavior for action-param option values.
4. Keep query and validation logic generic (no game-specific branches).

## Invariants

1. Every `ChoiceOption.value` returned from action-param pending requests is a valid `MoveParamValue`.
2. Non-encodable action-param domain items are rejected deterministically at legality discovery/evaluation time.
3. Encodable options preserve stable ordering semantics of the underlying domain query.
4. Effect-driven and declared-param choice surfaces enforce equivalent encodability rules.

## Tests

1. **Unit (`legal-choices`)**: action param domain returning object rows/tokens fails fast with explicit runtime validation error.
2. **Unit (`legal-choices`)**: action param domain returning scalar/array move-param values produces pending options with valid `MoveParamValue` payloads only.
3. **Unit (`legal-choices`)**: target metadata (`targetKinds`) remains correct after encodability enforcement.
4. **Regression**: existing effect-choice encodability tests remain green (`chooseOne`/`chooseN` behavior unchanged).

