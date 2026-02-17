# STATEMOD-016: Tighten GameStore Choice API Contract by Pending Choice Type

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: STATEMOD-015

## Objective

Make store choice mutation APIs stricter and more robust by encoding pending-choice shape constraints, reducing invalid calls and implicit runtime rejection paths.

## Assumption Reassessment (2026-02-17)

- `packages/runner/src/store/game-store.ts` currently exposes a single `makeChoice(choice: MoveParamValue)` action with no local guard that enforces pending `chooseOne` vs `chooseN` shape compatibility.
- `packages/runner/test/store/game-store.test.ts` currently covers happy-path progression and illegal choice rejections from `bridge.legalChoices`, but does not cover shape mismatch rejection before calling the bridge.
- Current runner code has no additional production callsites relying on `makeChoice` outside the store test suite, so a deliberate breaking API change is feasible and preferred for architectural clarity.
- `WorkerError` is currently constrained to `ILLEGAL_MOVE | VALIDATION_FAILED | NOT_INITIALIZED | INTERNAL_ERROR`; mismatch handling should remain within this taxonomy and use deterministic structured `details`.

## What Needs to Change / Be Added

1. Replace `makeChoice(choice: MoveParamValue)` with a deliberate breaking contract:
   - `chooseOne(choice: Exclude<MoveParamValue, readonly unknown[]>)`
   - `chooseN(choice: readonly Exclude<MoveParamValue, readonly unknown[]>[])`
   Do not keep compatibility aliases.
2. Add internal pending-choice guard(s) that validate API/action and value shape compatibility before building `nextChoice` and before any bridge call.
3. On mismatch, set deterministic structured store error using `WorkerError` code `VALIDATION_FAILED` with stable `details` payload (for example: `{ reason: 'CHOICE_TYPE_MISMATCH', expected, received }`) and do not mutate in-progress move construction state.
4. Preserve game-agnostic behavior and avoid game-specific branches.
5. Keep valid choice flow unchanged through `legalChoices` and move-construction pipeline.

## Invariants That Must Pass

- Invalid choice value shape cannot mutate `choiceStack`, `partialMove`, or `choicePending`.
- `chooseOne` action accepts only scalar move-param values and only when pending type is `chooseOne`.
- `chooseN` action accepts only scalar-array move-param values and only when pending type is `chooseN`.
- Valid choice values continue through legalChoices/apply pipeline unchanged.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New/updated tests in `packages/runner/test/store/game-store.test.ts`:
- pending `chooseOne` + `chooseN()` action is rejected before bridge call without state mutation
- pending `chooseN` + `chooseOne()` action is rejected before bridge call without state mutation
- mismatch rejection emits deterministic `VALIDATION_FAILED` error with stable structured `details`
- successful `chooseOne`/`chooseN` payloads still advance pending/complete flow

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Replaced store action `makeChoice` with explicit breaking actions `chooseOne` and `chooseN` in `packages/runner/src/store/game-store.ts`.
  - Added internal pending-choice submission validation to reject action/pending type mismatches and invalid payload shape before bridge calls.
  - Standardized mismatch errors as deterministic `WorkerError` payloads with `code: VALIDATION_FAILED` and structured `details`.
  - Updated `packages/runner/test/store/game-store.test.ts` to adopt the new actions and added mismatch/no-mutation regression coverage.
- **Deviations from original plan**:
  - Scope was tightened to enforce explicit action-level type matching (`chooseOne` vs `chooseN`) as the primary architectural contract, rather than only validating value shape on a single `makeChoice` action.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
