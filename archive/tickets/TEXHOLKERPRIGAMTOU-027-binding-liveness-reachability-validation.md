# TEXHOLKERPRIGAMTOU-027: Static Binding Liveness & Reachability Validation in Compile/Cross-Validate

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-025, TEXHOLKERPRIGAMTOU-026
**Blocks**: none

## 0) Assumption Reassessment (2026-02-16)

Current repository state differs from this ticket's original assumptions:

1. Static binding-liveness validation is already implemented in compile lowering, primarily in `src/cnl/compile-effects.ts` and `src/cnl/compile-conditions.ts`.
2. Missing/out-of-scope binding references already fail compilation via deterministic `CNL_COMPILER_BINDING_UNBOUND` diagnostics with exact paths and ranked alternatives.
3. Binding lifecycle and sequential visibility are centralized in explicit metadata in `src/cnl/binder-surface-registry.ts` (`declaredBinderPaths`, `sequentiallyVisibleBinderPaths`, `nestedSequentialBindingScopes`).
4. Cross-validate (`src/cnl/cross-validate.ts`) is not the architectural home for binder liveness; it handles section cross-references.
5. Dependencies `TEXHOLKERPRIGAMTOU-025` and `TEXHOLKERPRIGAMTOU-026` are already completed and archived.
6. Spec/runtime boundary already accepts that some dynamic binder-path correctness remains runtime-validated (for example condition-dependent binding availability).

## 0.1) Updated Scope (Corrected)

1. Keep binding-liveness validation in compile lowering (not cross-validate), preserving separation of concerns.
2. Confirm diagnostics remain deterministic/actionable/path-precise for statically knowable unbound references.
3. Strengthen tests for `if` branch export behavior so current contract is explicit and regression-safe.
4. Keep behavior game-agnostic and metadata-driven; no per-game logic, no aliasing.

## 1) What changed

1. Corrected ticket assumptions and scope to match current architecture and archived dependency state.
2. Added unit coverage for `if` branch binding visibility semantics in compile lowering.
3. Verified repository gates for this change set (`build`, `test`, `lint`).

## 2) Invariants

1. Statistically knowable unbound binding references fail compilation with deterministic diagnostics.
2. Equivalent docs produce deterministic diagnostic content/order.
3. `if` branch binder visibility semantics are explicitly tested and stable.
4. Validation remains game-agnostic and data-driven.

## 3) Tests

1. Unit: compile binding scope validation stays green for existing control-flow and sequential export surfaces.
2. Unit: added `if` branch binder visibility tests in `test/unit/compile-bindings.test.ts`.
3. Regression: `npm run build`, `npm test`, `npm run lint`.

## 4) Architecture Rationale

A new duplicate graph pass in `compile/cross-validate` is not a net improvement over current architecture:

1. The core static liveness guarantees already live in compile lowering where scopes are materialized.
2. Duplicating logic into cross-validate would split ownership and increase drift risk.
3. The cleanest current architecture is explicit compile-time checks plus explicit runtime validation for condition-dependent binding availability.
4. Highest-value work is to keep contracts explicit in tests and maintain deterministic diagnostics.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
  - Updated this ticket's assumptions/scope to align with the real codebase state.
  - Added targeted `if`-binding visibility tests in `test/unit/compile-bindings.test.ts`.
  - Kept compiler/runtime behavior aligned with existing production semantics while hardening test coverage.
- Deviations from original plan:
  - Did not implement a new graph-based cross-validate liveness pass because the capability already exists in lowering and would duplicate responsibility.
  - Did not enforce branch-guaranteed binding proofs for all `if` paths because that would change established runtime contract and production data behavior; this remains runtime-validated by design.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
