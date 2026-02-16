# TEXHOLKERPRIGAMTOU-031: Binding Contract Finalization (Docs, Runtime Surface, Quality Gates)

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-029, TEXHOLKERPRIGAMTOU-030
**Blocks**: none

## 1) What needs to change / be added

1. Update `specs/32-binding-and-parameter-semantics.md` and related docs to make definite-binding compile guarantees normative and remove outdated wording that dynamic binder correctness is generally runtime-validated.
2. Review runtime error surfaces (`MISSING_BINDING`) and classify remaining cases as truly dynamic-only (for example user-provided invalid move payloads), not compiler-missed static cases.
3. Add/strengthen quality-gate coverage so new compiler/runtime changes cannot reintroduce conditional-binding leakage after control-flow merges.
4. Ensure ticket/spec references and roadmap links remain consistent after this contract shift.
5. Keep architecture clean: compiler owns static liveness guarantees; runtime remains defensive but not primary validator for statically knowable cases.

## 2) Invariants that should pass

1. Documentation and implementation agree on binding guarantees and validation boundaries.
2. Static vs dynamic binding failure modes are explicitly separated and test-verified.
3. New effect/control-flow features cannot bypass definite-binding checks without failing tests.
4. Contract remains game-agnostic and extensible.

## 3) Tests that should pass

1. Unit: runtime error contract tests proving `MISSING_BINDING` only appears in allowed dynamic contexts.
2. Unit: compiler diagnostics/golden tests proving conditional-binding cases fail compile deterministically.
3. Integration: end-to-end compile+run suites for production specs remain green under updated contract.
4. Documentation consistency checks (where applicable) and cross-spec reference verification.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
