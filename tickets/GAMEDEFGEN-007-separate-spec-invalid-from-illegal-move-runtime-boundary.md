# GAMEDEFGEN-007: Separate Spec-Invalid Failures from Illegal-Move Failures at Runtime Boundary

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Introduce a dedicated runtime error category for spec/runtime-contract invalidity (distinct from `ILLEGAL_MOVE`).
2. Refactor `applyMove`/related paths so player-action illegality remains `ILLEGAL_MOVE`, while invalid runtime spec states use the new error type.
3. Update error creation/helpers in kernel runtime error modules to support this split clearly.
4. Keep external behavior deterministic and explicit; no compatibility aliasing.

## 2) Invariants That Should Pass

1. Player move illegality and spec invalidity are never conflated in runtime error typing.
2. Invalid spec/runtime contract states are surfaced with a dedicated error code and structured context.
3. Illegal moves still produce stable, deterministic `ILLEGAL_MOVE` diagnostics.
4. No valid gameplay path regresses due to the error-type split.

## 3) Tests That Should Pass

1. Unit: `applyMove` emits dedicated spec-invalid error for invalid selector/config contract failures.
2. Unit: `applyMove` still emits `ILLEGAL_MOVE` for true move illegality under valid spec.
3. Unit: error context payloads include action/profile identifiers for both categories.
4. Integration: existing simulator/game-loop tests continue to pass without behavior regressions.
