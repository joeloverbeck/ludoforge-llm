# KERLEGCHO-002: Action Param Option Encodability Contract

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — runtime contract hardening for discovery/evaluation outputs
**Deps**: KERLEGCHO-001 (recommended but not strictly required)

## Problem

Action-param pending options in `legalChoices*` are currently built from raw `evalQuery` values with a type cast, without enforcing move-param encodability. Some queries can produce object payloads, causing `pending.options[].value` to violate the move-param contract expected by downstream systems.

Effect-driven choices (`chooseOne`/`chooseN`) already enforce this contract and fail fast when options are not encodable. Declared action params should honor the same generic contract.

No backwards compatibility is required; non-encodable outputs should be rejected.

## Reassessed Assumptions (Code/Test Reality)

1. The core gap is real and localized: `resolveActionParamPendingChoice()` in `packages/engine/src/kernel/legal-choices.ts` currently maps `evalQuery(param.domain)` values into pending options via unsafe casting only.
2. Effect-choice encodability enforcement already exists and is tested (`packages/engine/src/kernel/effects-choice.ts`, `packages/engine/test/unit/effects-choice.test.ts`, plus a legal-choices effect-path regression in `packages/engine/test/unit/kernel/legal-choices.test.ts`).
3. `apply-move` already validates declared params through `isDeclaredActionParamValueInDomain()` and does not require behavioral changes for this ticket.
4. The shared, generic move-param normalizer already exists in `packages/engine/src/kernel/declared-action-param-domain.ts` as `normalizeMoveParamValue()`. This is the correct normalization policy for declared action params because it supports scalar and array `MoveParamValue` forms.

## Updated Scope

This ticket is scoped to declared action-param pending option construction in legal-choices only, with parity-level tests for the declared-param path.

## What to Change

**Files (expected)**:
- `packages/engine/src/kernel/legal-choices.ts`
- `packages/engine/test/unit/kernel/legal-choices.test.ts`
- `packages/engine/test/unit/kernel/choice-membership-parity.test.ts` (optional if parity coverage is added here instead)

Enforce canonical move-param encoding for action-param pending options:

1. Normalize/validate each option value from `param.domain` before adding it to pending `options`.
2. If an option is not move-param encodable, fail fast with deterministic runtime validation error (`LEGAL_CHOICES_VALIDATION_FAILED`) including actionable context (`actionId`, `param`, `index`, `actualType`, `value`).
3. Remove unsafe casting-only behavior for action-param option values.
4. Keep query and validation logic generic (no game-specific branches).

## Invariants

1. Every `ChoiceOption.value` returned from action-param pending requests is a valid `MoveParamValue`.
2. Non-encodable action-param domain items are rejected deterministically at legality discovery/evaluation time.
3. Encodable options preserve stable ordering semantics of the underlying domain query.
4. Effect-driven and declared-param choice surfaces enforce equivalent encodability rules (same normalization policy, surface-specific error code family).

## Tests

1. **Unit (`legal-choices`)**: declared action param domain returning non-encodable items fails fast with explicit `LEGAL_CHOICES_VALIDATION_FAILED`.
2. **Unit (`legal-choices`)**: action param domain returning scalar/array move-param values produces pending options with valid `MoveParamValue` payloads only.
3. **Unit (`legal-choices`)**: target metadata (`targetKinds`) remains correct after encodability enforcement.
4. **Regression**: existing effect-choice encodability tests remain green (`chooseOne`/`chooseN` behavior unchanged).

## Outcome

- **Completion date**: 2026-02-19
- **What changed**
  - Enforced declared action-param pending option normalization in `legal-choices` using shared `normalizeMoveParamValue()` instead of cast-only mapping.
  - Added deterministic fail-fast `LEGAL_CHOICES_VALIDATION_FAILED` for non-encodable declared-param domain option entries.
  - Consolidated move-param normalization policy into `packages/engine/src/kernel/move-param-normalization.ts` and reused it across declared-param and choice-membership surfaces.
  - Added unit coverage for:
    - non-encodable declared-param domain items,
    - canonical token-id normalization and `targetKinds` preservation for declared params.
    - shared scalar/object-id/array move-param normalization + equality semantics.
- **Deviations from original plan**
  - No `apply-move` changes were needed (already validates declared params).
  - No `effects-choice` changes were needed (already enforces encodability).
- **Verification**
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
