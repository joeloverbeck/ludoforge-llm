# GAMEDEFGEN-007: Separate Spec-Invalid Failures from Illegal-Move Failures at Runtime Boundary

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## Reassessed Assumptions (2026-02-15)

1. The current kernel already distinguishes selector outcomes in lower-level resolvers (`resolveActionActor`/`resolveActionExecutor`) as `applicable | notApplicable | invalidSpec`.
2. The conflation happens at the `applyMove` runtime boundary, where `invalidSpec` selector outcomes are currently rethrown as `ILLEGAL_MOVE` with metadata codes:
   - `ACTION_ACTOR_INVALID_SPEC`
   - `ACTION_EXECUTOR_INVALID_SPEC`
3. `legalMoves` already throws underlying invalid-spec errors directly in analogous paths; this ticket is specifically about `applyMove` boundary semantics.
4. Existing tests currently encode the conflation in `test/unit/kernel/apply-move.test.ts` (executor applicability contract block).
5. No compatibility aliasing is desired: downstream code/tests should consume the new dedicated runtime error code directly.

## 1) What Needs To Change / Be Added

1. Introduce a dedicated `KernelRuntimeErrorCode` for invalid runtime/spec contract failures surfaced at `applyMove` (distinct from `ILLEGAL_MOVE`).
2. Refactor `applyMove` so:
   - true move illegality remains `ILLEGAL_MOVE`
   - selector/runtime-contract invalidity (`invalidSpec` from actor/executor resolution) throws the new dedicated runtime error code directly.
3. Update runtime error helpers in `src/kernel/runtime-error.ts` to provide explicit construction of this error kind with structured context.
4. Update unit tests that currently expect `ILLEGAL_MOVE` for selector invalid-spec scenarios.
5. Keep behavior deterministic and explicit; no compatibility aliases, no dual-emission of old/new codes.

## 2) Invariants That Should Pass

1. Player move illegality and spec invalidity are never conflated in runtime error typing.
2. Invalid spec/runtime contract states at `applyMove` are surfaced with a dedicated kernel runtime error code and structured context (`actionId`, selector surface, underlying reason/cause).
3. Illegal moves still produce stable, deterministic `ILLEGAL_MOVE` diagnostics.
4. No valid gameplay path regresses due to the error-type split.

## 3) Tests That Should Pass

1. Unit (`test/unit/kernel/apply-move.test.ts`): invalid actor selector shape emits dedicated spec-invalid runtime error (not `ILLEGAL_MOVE`).
2. Unit (`test/unit/kernel/apply-move.test.ts`): invalid executor selector shape emits dedicated spec-invalid runtime error (not `ILLEGAL_MOVE`).
3. Unit (`test/unit/kernel/apply-move.test.ts`): actor/executor not-applicable cases remain `ILLEGAL_MOVE`.
4. Unit: dedicated spec-invalid error includes structured context identifying surface (`actor`/`executor`) and `actionId`.
5. Regression: targeted kernel/apply-move tests + broader `npm test` + lint pass.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added `RUNTIME_CONTRACT_INVALID` to `KernelRuntimeErrorCode` and a dedicated helper in `src/kernel/runtime-error.ts`.
  - Added shared selector boundary adapter in `src/kernel/selector-runtime-contract.ts` to centralize conversion of selector `invalidSpec` failures into dedicated runtime-contract errors.
  - Refactored `src/kernel/apply-move.ts`, `src/kernel/legal-moves.ts`, and `src/kernel/legal-choices.ts` to use the shared selector boundary adapter and emit consistent typed boundary errors.
  - Updated `test/unit/kernel/apply-move.test.ts` for actor invalid-selector behavior and added explicit executor invalid-selector coverage.
  - Updated `test/unit/kernel/legal-moves.test.ts` and `test/unit/kernel/legal-choices-executor.test.ts` to assert typed `RUNTIME_CONTRACT_INVALID` errors with boundary context.
- Deviations from original plan:
  - No additional integration tests were needed beyond existing full-suite regression runs because behavior change is localized to runtime error typing at `applyMove` and is fully exercised by unit tests plus full regression.
- Verification:
  - `node --test dist/test/unit/kernel/apply-move.test.js` passed.
  - `node --test dist/test/unit/kernel/legal-moves.test.js` passed.
  - `node --test dist/test/unit/kernel/legal-choices-executor.test.js` passed.
  - `npx eslint src/kernel/selector-runtime-contract.ts src/kernel/apply-move.ts src/kernel/legal-moves.ts src/kernel/legal-choices.ts test/unit/kernel/apply-move.test.ts test/unit/kernel/legal-choices-executor.test.ts test/unit/kernel/legal-moves.test.ts` passed.
  - Note: full repository build/test is currently blocked by unrelated concurrent-session work in `src/kernel/combinatorics.ts`.
