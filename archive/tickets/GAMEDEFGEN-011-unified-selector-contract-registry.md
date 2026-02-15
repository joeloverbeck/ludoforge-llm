# GAMEDEFGEN-011: Unified Selector Contract Registry Across Compiler and Kernel

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 0) Assumption Reassessment (2026-02-15)

### Confirmed Current State

1. Compiler already has partial shared selector-binding logic in `src/cnl/selector-binding-contracts.ts` and uses it in lowering.
2. Runtime legality surfaces already share a common preflight path via `resolveActionApplicabilityPreflight`.
3. Selector normalization and runtime selector resolution are implemented and broadly test-covered.

### Discrepancies vs Original Ticket Assumptions

1. There is not yet a single authoritative selector contract registry consumed by compiler + runtime; constraints are still distributed across:
   - `src/cnl/compile-selectors.ts` (selector form/cardinality),
   - `src/cnl/compile-lowering.ts` (binding declaration checks),
   - `src/cnl/cross-validate.ts` (pipeline restriction for binding-derived executor),
   - runtime resolution/preflight modules (selector invalid-spec behavior).
2. Runtime preflight does not currently consume explicit contract metadata for static action selector constraints (for example declared-binding requirement and pipeline compatibility).
3. Contract drift risk remains because equivalent policy is encoded in multiple modules.

### Updated Scope For This Ticket

1. Introduce one game-agnostic selector contract registry module in `src/` for action selector surfaces (`actor`, `executor`) and role policies.
2. Move compiler selector-contract enforcement to consume that registry (lowering + cross-validation contract checks).
3. Add runtime preflight contract checks that consume the same registry metadata before selector resolution.
4. Keep strict/no-alias behavior and deterministic diagnostics.
5. Keep broader selector-surface expansion (zone/turn-flow/trigger surfaces) out of scope for this ticket (covered by later selector-surface expansion work).

## 1) What To Fix / Add

1. Introduce a single, game-agnostic selector contract registry in `src/` for action selector roles (`actor`, `executor`) with cardinality/binding/pipeline policy metadata.
2. Make compiler lowering and cross-validation consume this registry instead of role-policy duplication.
3. Thread registry-backed contract checks into runtime preflight so compile-time and runtime selector contracts cannot drift.
4. Preserve strict/no-alias semantics: exact selector and binding forms only.

## 2) Invariants That Should Pass

1. A selector rule is declared once and enforced consistently across compile-time and runtime surfaces.
2. Contract updates in one place change behavior deterministically across all participating modules.
3. No game-specific logic is introduced; registry remains generic and reusable.
4. Diagnostics (code/path/message/suggestion) remain deterministic and stable.
5. Static selector-contract violations in runtime preflight surface as `invalidSpec` consistently for all legality boundaries.

## 3) Tests That Should Pass

1. Unit: registry contract definitions validate expected role constraints (single vs multi, binding-declared requirement, pipeline compatibility).
2. Unit: compiler lowering + cross-validation consume registry and emit stable diagnostics for selector contract violations.
3. Unit: runtime preflight rejects the same static selector-contract violations via `invalidSpec` metadata.
4. Regression: existing selector compile/runtime unit suites continue to pass.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added shared selector contract registry in `src/kernel/action-selector-contract-registry.ts`.
  - Updated compiler lowering to consume registry-backed declared-binding checks.
  - Updated cross-validation to consume registry-backed pipeline incompatibility checks.
  - Updated runtime preflight to enforce static selector contract checks from the same registry before selector resolution.
  - Added/updated unit coverage in:
    - `test/unit/kernel/action-selector-contract-registry.test.ts`
    - `test/unit/kernel/action-applicability-preflight.test.ts`
- **Deviations from original plan**:
  - Selector-surface expansion beyond action actor/executor remained out of scope.
- **Verification results**:
  - `npm run lint` passed.
  - `npm test` passed (build + unit + integration).
