# ACTTOOLTIP-006: Complete macroOrigin regression coverage for removeByPriority compile/validate surfaces

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests only
**Deps**: ACTTOOLTIP-005

## Problem

Recent provenance improvements for `removeByPriority` added behavior in multiple layers (expansion, lowering, validation, display), but regression coverage is still uneven:
- compile-effects tests do not explicitly lock root-level `removeByPriority.macroOrigin` invalid/untrusted diagnostic paths.
- validate-spec tests currently cover `removeByPriority` authored metadata in action effects, but not the same violation paths in setup/turn-structure locations.

This leaves long-term architecture exposed to silent regressions in compiler-owned metadata boundaries.

## Assumption Reassessment (2026-02-27)

1. `compile-effects.ts` reads and validates both `removeByPriority.macroOrigin` and `groups[i].macroOrigin` — confirmed.
2. Current `compile-effects.test.ts` additions assert group-level invalid/untrusted diagnostics, not explicit root-level invalid/untrusted diagnostics for `removeByPriority` — confirmed.
3. Current trusted-preservation coverage already asserts root `removeByPriority.macroOrigin` survives lowering in `compile-effects.test.ts` — confirmed.
4. `validate-actions.ts` forbids authored `removeByPriority.macroOrigin` and `removeByPriority.groups[i].macroOrigin` generically across effect trees — confirmed.
5. Current `validate-spec.test.ts` asserts those `removeByPriority` paths only under `doc.actions.0.effects[...]` and not setup/turn-structure placements — confirmed.
6. Existing active tickets do not define this specific missing regression matrix — confirmed.

## Architecture Check

1. Strong regression tests are part of robust architecture: compiler-owned metadata contracts must be locked at every entry surface.
2. Test-only changes preserve agnostic boundaries; no game-specific behavior is introduced.
3. No compatibility pathways: tests enforce strict contract and fail hard on regressions.

## What to Change

### 1. Add compile-effects root-level macroOrigin rejection tests

In `compile-effects.test.ts`:
- Add a case for malformed root `removeByPriority.macroOrigin` and assert `CNL_COMPILER_MACRO_ORIGIN_INVALID` at `.removeByPriority.macroOrigin`.
- Add a case for untrusted root `removeByPriority.macroOrigin` and assert `CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED` at `.removeByPriority.macroOrigin`.

### 2. Expand validate-spec metadata-forbidden coverage across surfaces

In `validate-spec.test.ts`:
- Add setup-level authored `removeByPriority.macroOrigin` and group macroOrigin payloads.
- Add turn-structure-level authored `removeByPriority.macroOrigin` and group macroOrigin payloads.
- Assert `CNL_VALIDATOR_EFFECT_MACRO_ORIGIN_FORBIDDEN` diagnostics on each expected path.

## Files to Touch

- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)

## Out of Scope

- Changing production compiler/validator implementation logic
- Refactoring macro-origin annotation internals
- Any runner/UI work

## Acceptance Criteria

### Tests That Must Pass

1. New compile-effects tests fail if root-level `removeByPriority.macroOrigin` trust/shape checks regress.
2. New validate-spec tests fail if authored `removeByPriority` macroOrigin is not rejected in setup/turn surfaces.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler-owned metadata rejection is consistent across all effect-tree surfaces.
2. Root and group provenance contracts are both guarded by explicit tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — Add root-level invalid/untrusted macroOrigin diagnostic assertions for `removeByPriority`.
2. `packages/engine/test/unit/validate-spec.test.ts` — Add setup/turnStructure coverage for authored `removeByPriority` root/group macroOrigin rejection.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Added root-level `removeByPriority.macroOrigin` invalid/untrusted regression assertions in `compile-effects.test.ts`.
  - Expanded `validate-spec.test.ts` authored-metadata rejection coverage to include setup and turn-structure `removeByPriority` root/group `macroOrigin` paths.
  - Updated this ticket’s assumptions/scope to reflect that trusted root preservation was already covered before implementation.
- **Deviation from original plan**:
  - Removed planned work to add root-preservation assertion because it already existed.
  - Kept scope test-only; no production compiler/validator code changes were needed.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/compile-effects.test.js` passed.
  - `node --test packages/engine/dist/test/unit/validate-spec.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`304` tests, `0` failures).
  - `pnpm -F @ludoforge/engine lint` passed.
