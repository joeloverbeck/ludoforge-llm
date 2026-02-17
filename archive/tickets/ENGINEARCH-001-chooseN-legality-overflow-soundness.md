# ENGINEARCH-001: chooseN Option Legality Overflow Soundness

**Status**: ✅ COMPLETED
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: None
**Estimated complexity**: M

---

## Summary

Fix unsound `chooseN` option-legality overflow behavior so the engine never upgrades unknown legality to proven legal when the combinatorial probe budget is exceeded.

---

## Reassessed Assumptions (Current Code Reality)

- `packages/engine/src/kernel/legal-choices.ts` currently returns optimistic legality (`isLegal: true`) for every option when `chooseN` legality probing exceeds `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS`.
- Runner worker calls already request option legality (`includeOptionLegality: true`), but runner model derivation still contains fail-open fallback paths when legality metadata is absent.
- Existing tests cover deferred legality/costValidation probing but do not cover the `chooseN` overflow path.
- This issue is in legality discovery surfaces (engine + runner projection). Simulator move execution is not the source of this bug.

---

## Updated Scope

- Update engine pending-choice option legality contract to represent explicit legality state: `legal`, `illegal`, or `unknown`.
- Update `packages/engine/src/kernel/legal-choices.ts` so `chooseN` overflow emits `unknown` legality, never `legal`.
- Keep logic game-agnostic and derived from generic choice semantics only.
- Update runner render model derivation to fail closed on missing legality metadata (`unknown`) and make unknown options non-selectable.
- Update affected type/contract tests across engine and runner to the explicit legality-state contract.

---

## Invariants That Must Pass

- Engine never emits proven legal status when legality is not proven.
- `legalChoices` remains deterministic for the same `(GameDef, GameState, Move)` input.
- Overflow handling is generic and independent of specific game content.
- Runner selectable targets derive strictly from `legal` options; `unknown` and `illegal` are non-selectable.

---

## Tests That Should Pass

- `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - add `chooseN` overflow case and assert `unknown` legality for all options.
  - add non-overflow case asserting legal/illegal option statuses are still exact.
- `packages/engine/test/unit/effects-choice.test.ts`
  - adjust pending-choice discovery expectations to explicit legality-state entries.
- `packages/runner/test/model/derive-render-model-zones.test.ts`
  - add case verifying `unknown` legality options are not marked selectable.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - add case verifying `unknown` legality is surfaced consistently in rendered choice options.
- `packages/runner/test/worker/clone-compat.test.ts`
  - ensure updated legality payload remains structured-clone compatible.
- Existing suites remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`

---

## Outcome

- Completion date: 2026-02-17
- Actually changed:
  - Replaced boolean option legality with explicit tri-state legality (`legal` / `illegal` / `unknown`) in engine choice contracts.
  - Fixed `chooseN` overflow behavior in `legalChoices` so overflow emits `unknown` (never optimistic `legal`).
  - Updated runner render derivation to fail closed on missing legality metadata (`unknown`) and allow selectability only for `legal`.
  - Added/updated engine and runner tests to cover overflow unknown behavior and projection/selectability semantics.
- Deviations from original plan:
  - Instead of adding a separate confidence flag, legality is now represented directly as a tri-state contract for cleaner long-term extensibility.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine typecheck` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm -F @ludoforge/engine build` passed
  - `pnpm -F @ludoforge/runner test` passed
  - `pnpm -F @ludoforge/runner typecheck` passed
  - `pnpm -F @ludoforge/runner lint` passed
