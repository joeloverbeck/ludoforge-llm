# GAMEDEFGEN-020: Typed Runtime Error Context Contracts by Error Code

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 0) Assumption Reassessment (Code/Test Reality)

1. `src/kernel/runtime-error.ts` still uses untyped context payloads (`Record<string, unknown>`), so the core ticket problem is valid.
2. Current helper surface is: `kernelRuntimeError`, `illegalMoveError`, `pipelineApplicabilityEvaluationError`, `pipelinePredicateEvaluationError`, `runtimeContractInvalidError`, and selector wrapper `selectorInvalidSpecError` in `src/kernel/selector-runtime-contract.ts`.
3. There is no dedicated selector-specific runtime error code; selector failures currently map to `RUNTIME_CONTRACT_INVALID` with deterministic `reason/surface/selector/...` fields.
4. Existing tests already assert runtime context payload fields for pipeline and selector/contract flows (for example `test/unit/kernel/apply-move-pipeline.test.ts`, `test/unit/kernel/action-pipeline-predicates.test.ts`, `test/unit/kernel/legality-surface-parity.test.ts`), but they do not enforce compile-time context contracts.
5. Some codes are inherently extensible context-bag surfaces (`LEGAL_CHOICES_VALIDATION_FAILED`, `RUNTIME_CONTRACT_INVALID`) and should remain open payload envelopes while still being code-scoped.

## 1) What Needs To Change / Be Added

1. Introduce a canonical `KernelRuntimeErrorContextByCode` type map keyed by `KernelRuntimeErrorCode`.
2. Refactor `KernelRuntimeError` and `kernelRuntimeError(...)` to be generic over error code and context (`C -> ContextByCode[C]`).
3. Refactor helper constructors (`illegalMoveError`, pipeline helpers, runtime-contract helper) to emit code-scoped typed contexts.
4. Keep architecture engine-generic: no game-specific fields or branching in runtime error contracts.
5. Preserve intentional extensibility for `LEGAL_CHOICES_VALIDATION_FAILED` and `RUNTIME_CONTRACT_INVALID`, but make this explicit in the type map and ticket scope.

## 2) Invariants That Should Pass

1. Runtime error constructors/helpers statically tie context payload type to `KernelRuntimeErrorCode`.
2. Deterministic-code payloads (for example pipeline, illegal move, phase/terminal/turn-flow hard-failure codes) have required fields typed and enforced.
3. Extensible envelope codes remain explicitly typed as open context bags, not ad hoc hidden behavior.
4. Runtime behavior and error semantics remain unchanged (typing hardening only).
5. Contracts remain engine-generic and reusable across games.

## 3) Tests That Should Pass

1. Unit: runtime-error helper tests verify deterministic context payload shapes per code (`illegalMoveError`, pipeline helper constructors, runtime-contract helper).
2. Unit: selector/pipeline suites continue to expose deterministic metadata under typed contracts.
3. Regression: existing legality and runtime error suites pass without behavioral regressions.
4. Type safety: project typecheck/build pass with new code-scoped runtime error context contracts.

## 4) Scope Clarification

1. This ticket focuses on kernel runtime error typing architecture and helper/callsite typing hardening.
2. It does **not** introduce new runtime error codes or alter runtime error messages.
3. It does **not** attempt to make every possible context field globally closed; only deterministic contracts are strict, while explicitly extensible surfaces remain open by design.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added canonical `KernelRuntimeErrorContextByCode` contracts and generic `KernelRuntimeError<C>` typing in `src/kernel/runtime-error.ts`.
  - Typed helper constructors and predicates (`kernelRuntimeError`, `illegalMoveError`, pipeline helpers, `runtimeContractInvalidError`) to code-specific context contracts.
  - Centralized selector surface type ownership in `src/kernel/runtime-error.ts` and consumed it from `src/kernel/selector-runtime-contract.ts`.
  - Added contract-focused runtime tests in `test/unit/kernel/runtime-error-contracts.test.ts`.
- Deviations from original plan:
  - Intentionally retained explicit open-envelope contracts for `LEGAL_CHOICES_VALIDATION_FAILED` and `RUNTIME_CONTRACT_INVALID` where extensibility is part of current architecture.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `node --test dist/test/unit/kernel/runtime-error-contracts.test.js` passed.
  - `node --test dist/test/unit/kernel/apply-move-pipeline.test.js dist/test/unit/kernel/action-pipeline-predicates.test.js dist/test/unit/kernel/legality-surface-parity.test.js` passed.
  - `npm test` passed.
