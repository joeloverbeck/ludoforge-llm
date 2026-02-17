# STATEMOD-016: Tighten GameStore Choice API Contract by Pending Choice Type

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: STATEMOD-015

## Objective

Make store choice mutation APIs stricter and more robust by encoding pending-choice shape constraints, reducing invalid calls and implicit runtime rejection paths.

## What Needs to Change / Be Added

1. Refine store action contract in `packages/runner/src/store/game-store.ts` so choice submission is validated against current `choicePending` type (`chooseOne` scalar vs `chooseN` array) before bridge call.
2. Introduce internal validation helper(s) for pending-choice/value compatibility; return structured store error on mismatch without mutating choice stack.
3. Preserve game-agnostic behavior and avoid introducing game-specific branching.
4. Keep API ergonomics clean; if renaming/splitting actions yields a clearer contract, perform a deliberate breaking change rather than aliasing.

## Invariants That Must Pass

- Invalid choice value shape cannot mutate `choiceStack`, `partialMove`, or `choicePending`.
- `chooseOne` accepts only scalar move-param values.
- `chooseN` accepts only array move-param values.
- Valid choice values continue through legalChoices/apply pipeline unchanged.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New/updated tests in `packages/runner/test/store/game-store.test.ts`:
- chooseOne rejects array payload without state mutation
- chooseN rejects scalar payload without state mutation
- successful chooseOne/chooseN payloads still advance pending/complete flow
- mismatch rejection emits deterministic structured error code/message
