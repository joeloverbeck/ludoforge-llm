# ENGINEARCH-032: Restore zoneVar validation parity for setVar/addVar in behavior validator

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — behavior validator diagnostics + unit tests
**Deps**: none

## Problem

`setVar` and `addVar` now have strict scope contracts at AST/schema level, but `validateEffectAst` still lacks full `zoneVar` semantic parity (unknown-zoneVar name + boolean-target checks). This allows some invalid `zoneVar` payloads to pass validation and fail later at runtime.

## Assumption Reassessment (2026-02-25)

1. `validate-gamedef-behavior.ts` validates `global` and `pvar` var references for `setVar`/`addVar`, and validates `zoneVar` only for zone selector shape.
2. `transferVar` validation already enforces `zoneVar` name existence (`REF_ZONEVAR_MISSING`) and boolean-target rejection, so stricter precedent exists in the same validator.
3. **Mismatch + correction**: after the recent scope-contract hardening, semantic validation parity remains incomplete for `setVar`/`addVar` `zoneVar` branches and must be completed here.

## Architecture Check

1. Aligning semantic checks across all scoped var operations is cleaner and safer than relying on runtime failures for one branch.
2. This remains fully game-agnostic kernel validation logic; no game-specific `GameSpecDoc`/`visual-config.yaml` behavior is introduced.
3. No backwards-compatibility shims: invalid `zoneVar` payloads are rejected earlier and explicitly.

## What to Change

### 1. Complete zoneVar semantic checks in `validateEffectAst`

For `setVar` scope `zoneVar`:
- Validate variable existence against `zoneVarNames` and emit `REF_ZONEVAR_MISSING` where appropriate.

For `addVar` scope `zoneVar`:
- Validate variable existence against `zoneVarNames` and emit `REF_ZONEVAR_MISSING`.
- Reject boolean targets with `ADDVAR_BOOLEAN_TARGET_INVALID` parity semantics (or equivalent existing diagnostic strategy).
- Ensure type lookup is scope-correct (`global` vs `pvar` vs `zoneVar`) instead of treating all non-global as `pvar`.

### 2. Add validator regression tests

Add/extend unit tests to prove:
- unknown `zoneVar` in `setVar`/`addVar` produces diagnostics.
- `addVar` on boolean `zoneVar` is rejected by behavior validation.
- valid `zoneVar` `setVar`/`addVar` cases remain accepted.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef-input.test.ts` (modify, if needed)

## Out of Scope

- AST/schema shape changes for scoped variable payloads
- Runtime effect execution refactors
- Runner/UI logging behavior

## Acceptance Criteria

### Tests That Must Pass

1. `setVar` with unknown `zoneVar` is rejected with missing-reference diagnostics.
2. `addVar` with unknown or boolean `zoneVar` target is rejected by validator diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Semantic validation rigor for `global`/`pvar`/`zoneVar` is consistent across var operations.
2. Invalid variable references are rejected in validation phase, not deferred to runtime.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add `setVar`/`addVar` `zoneVar` missing/boolean diagnostic coverage.
2. `packages/engine/test/unit/validate-gamedef-input.test.ts` — add compile-input level regression coverage if needed for diagnostic surface.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef-input.test.js`
4. `pnpm -F @ludoforge/engine test:unit`
5. `pnpm -F @ludoforge/engine lint`
