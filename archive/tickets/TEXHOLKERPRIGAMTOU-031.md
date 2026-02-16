# TEXHOLKERPRIGAMTOU-031: Binding Contract Finalization (Docs, Runtime Surface, Quality Gates)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: archive/tickets/TEXHOLKERPRIGAMTOU-029.md, archive/tickets/TEXHOLKERPRIGAMTOU-030.md
**Blocks**: none

## 0) Reassessed assumptions (2026-02-16)

1. `TEXHOLKERPRIGAMTOU-029` and `TEXHOLKERPRIGAMTOU-030` are already completed and archived; this ticket should not re-implement compiler dataflow or production-spec migration work.
2. Definite-binding branch-merge guarantees are already enforced in compiler/runtime-adjacent tests (`test/unit/compile-bindings.test.ts`, `test/unit/binder-surface-registry.test.ts`, `test/integration/production-spec-strict-binding-regression.test.ts`).
3. The main doc discrepancy is in `specs/32-binding-and-parameter-semantics.md`, which still states dynamic binder correctness is generally runtime-validated; this is now stale for statically knowable control-flow binding liveness.
4. `MISSING_BINDING` still exists as a low-level eval/runtime signal, but public runtime surfaces should project typed contract/illegal-move errors except for explicitly deferred discovery contexts.
5. Scope should focus on contract alignment and regression gates, preserving the current game-agnostic architecture and avoiding compatibility aliases.

## 1) What needs to change / be added

1. Update `specs/32-binding-and-parameter-semantics.md` (and only any truly related docs if needed) to make compile-time definite-binding guarantees normative for statically knowable control-flow cases.
2. Clarify runtime `MISSING_BINDING` classification boundaries: allowed for dynamic/deferred internal discovery and low-level eval helpers, but not as raw top-level public surface contract for statically knowable misses.
3. Add/strengthen tests to guard both:
- conditional-binding non-leakage across control-flow merges (as a quality gate)
- runtime surface behavior for missing bindings in dynamic/deferred contexts.
4. Ensure references/dependencies for this ticket are consistent with archived predecessors.
5. Keep architecture clean: compiler owns static liveness guarantees; runtime remains defensive for dynamic inputs/spec-runtime contract enforcement.

## 2) Invariants that should pass

1. Documentation and implementation agree on binding guarantees and validation boundaries.
2. Static vs dynamic binding failure modes are explicitly separated and test-verified.
3. Control-flow merge behavior cannot regress to conditional-binding leakage without failing tests.
4. Public runtime surfaces do not leak raw `MISSING_BINDING` for statically knowable issues.
5. Contract remains game-agnostic and extensible.

## 3) Tests that should pass

1. Unit: compiler diagnostics/golden tests proving conditional-binding cases fail compile deterministically.
2. Unit: runtime contract tests proving missing-binding behavior is deferred/typed only in allowed dynamic contexts.
3. Integration: production strict-binding regression suites remain green.
4. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16.
- What actually changed:
  - Reassessed and corrected ticket assumptions/scope before implementation, including archived dependency references and existing coverage from `TEXHOLKERPRIGAMTOU-029` and `TEXHOLKERPRIGAMTOU-030`.
  - Updated `specs/32-binding-and-parameter-semantics.md` to make compile-time definite-binding/control-flow merge guarantees normative and to clarify `MISSING_BINDING` as dynamic/deferred/runtime-internal rather than statically knowable liveness validation.
  - Added runtime contract guardrail tests in:
    - `test/unit/kernel/action-pipeline-predicates.test.ts`
    - `test/unit/action-executor-binding.test.ts`
- Deviations from original plan:
  - No compiler/runtime architecture refactor was needed; core strict-binding dataflow and merge semantics were already implemented and covered by predecessor tickets.
  - Work focused on contract alignment and regression hardening rather than new lowering/runtime behavior.
- Verification results:
  - `npm run build` passed.
  - Targeted tests passed:
    - `dist/test/unit/kernel/action-pipeline-predicates.test.js`
    - `dist/test/unit/action-executor-binding.test.js`
    - `dist/test/unit/compile-bindings.test.js`
    - `dist/test/unit/binder-surface-registry.test.js`
    - `dist/test/integration/production-spec-strict-binding-regression.test.js`
  - `npm test` passed.
  - `npm run lint` passed.
