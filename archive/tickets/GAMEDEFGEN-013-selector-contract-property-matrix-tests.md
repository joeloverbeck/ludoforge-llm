# GAMEDEFGEN-013: Selector Contract Matrix Parity Tests (Compiler + Runtime)

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) Reassessed Assumptions (Current Code Reality)

1. Selector contracts are centralized in `src/kernel/action-selector-contract-registry.ts` and currently cover:
   - missing binding declarations (`bindingNotDeclared`)
   - executor binding with pipelines unsupported (`bindingWithPipelineUnsupported`)
2. Full selector-shape/cardinality validation is not part of this registry contract surface; it is enforced separately by selector normalization/runtime resolution.
3. Compiler surfaces can emit multiple diagnostics from selector contract violations, while runtime preflight (`resolveActionApplicabilityPreflight`) currently returns the first violation only.
4. Existing tests already cover key examples and deterministic actor-before-executor ordering for specific cases, but not an exhaustive matrix across role/binding/pipeline combinations.

## 2) Updated Scope

1. Add deterministic matrix-style tests for the shared selector contract boundary (registry-driven violations only), not full selector-shape validity.
2. Prove parity across:
   - compiler lowering/cross-validation diagnostics
   - runtime preflight invalid-spec selection
3. Cover ordering and first-violation behavior explicitly:
   - actor-before-executor violation ordering in registry/compiler outputs
   - runtime preflight selecting the first violation deterministically
4. Keep tests generic and data-agnostic (no game-specific fixtures).

## 3) Architectural Rationale

1. This work strengthens the existing architecture rather than replacing it:
   - single contract source of truth remains the registry
   - compiler/runtime consume the same contract logic
2. Matrix tests are beneficial because they reduce drift risk as contract roles/violation kinds evolve.
3. No backward-compatibility aliases are introduced; strict behavior remains unchanged.

## 4) Invariants That Must Hold

1. Registry evaluation is deterministic and role-ordered (`actor` then `executor`).
2. Compiler diagnostics for registry violations are deterministic and correctly coded per role/kind.
3. Runtime preflight returns `invalidSpec` with the first registry violation role/kind consistently.
4. Valid combinations produce no selector-contract violations.

## 5) Tests That Should Pass

1. Unit matrix: `evaluateActionSelectorContracts` across actor/executor binding selectors, declared/undeclared bindings, and pipeline presence.
2. Compiler parity matrix: generated action specs assert expected selector-contract diagnostics and order.
3. Runtime parity matrix: generated actions through `resolveActionApplicabilityPreflight` assert expected first `invalidSpec` selector/violation.
4. Regression: existing selector/compiler/runtime test suites continue to pass.

## Outcome

- Completion date: 2026-02-15
- Actually changed:
  - Added deterministic matrix coverage for selector contract registry evaluation.
  - Added compiler matrix coverage for selector-contract diagnostics, including ordering and compile-section failure behavior.
  - Added runtime preflight matrix coverage for first-violation determinism across actor/executor binding + pipeline combinations.
- Deviations from original plan:
  - Scope was intentionally narrowed from "all selector forms" to the shared registry contract surface (binding declaration + executor pipeline compatibility), matching actual architecture boundaries.
  - "Property-based" implementation was done via deterministic matrix generation loops (no external property-testing dependency introduced).
- Verification:
  - `npm test` passed.
  - `npm run lint` passed.
