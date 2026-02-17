# ENGINEARCH-003: Legality Probe Context Reuse and Scalability

**Status**: ✅ COMPLETED
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P2
**Depends on**: ENGINEARCH-001, ENGINEARCH-002
**Estimated complexity**: M

---

## Summary

Refactor legality probing so repeated option checks reuse precomputed static evaluation context and avoid repeated full `legalChoices` setup per probe.

---

## Assumption Reassessment (2026-02-17)

- `packages/engine/src/kernel/legal-choices.ts` still recursively calls `legalChoices(...)` from option probing (`chooseOne` and `chooseN`). This currently rebuilds action lookup + adjacency graph + runtime table index on each probe call.
- Deferred pipeline legality/costValidation probe semantics are already covered in `packages/engine/test/unit/kernel/legal-choices.test.ts` (for both `chooseOne` and `chooseN`).
- Overflow protection for large `chooseN` combination spaces is already present and covered in `packages/engine/test/unit/kernel/legal-choices.test.ts`.
- `packages/engine/test/integration/decision-sequence.test.ts` exists and should continue passing; this ticket is not changing decision-sequence semantics.
- `packages/runner/test/model/derive-render-model-state.test.ts` exists and should continue passing; this ticket is kernel-internal and should preserve runner semantics.

## Updated Scope

- Extract reusable legality-probe context inside `packages/engine/src/kernel/legal-choices.ts` so recursive probes reuse static per-action computation (notably action lookup, adjacency graph, runtime table index).
- Keep action-applicability preflight and predicate/effect evaluation per-probe, because they depend on per-probe bindings/selected options.
- Keep the kernel API generic and reusable; do not introduce game-specific branching or per-game data assumptions.
- Preserve deterministic behavior and pending-choice semantics while reducing repeated setup work.

## What Needs to Fix

- Extract reusable legality-probe context from `legalChoices` in `packages/engine/src/kernel/legal-choices.ts` so probing does not rebuild adjacency graph/runtime table/action lookup on each option check.
- Keep probing logic generic for all games and action pipelines.
- Preserve deterministic behavior while improving worst-case probing cost.
- Add clear internal structure for future heuristics/pruning without game-specific special cases.

---

## Invariants That Must Pass

- For identical inputs, legality outcomes are identical before and after refactor.
- Probe execution does not change the semantic meaning of legality/costValidation checks.
- Refactor introduces no game-specific branches or data-shape assumptions.
- Engine remains deterministic and side-effect free for legality discovery.

---

## Tests That Should Pass

- `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - retain existing deferred pipeline probe regressions for `chooseOne` and `chooseN`.
  - add/adjust tests for probe-context reuse invariants (including unchanged legality outcomes under probing).
- `packages/engine/test/integration/decision-sequence.test.ts`
  - ensure decision sequencing semantics remain unchanged after probe-context refactor.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - confirm runner legality projections are unchanged semantically.
- Existing suites remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`

---

## Outcome

- Completion date: 2026-02-17
- What changed:
  - Refactored `packages/engine/src/kernel/legal-choices.ts` to prepare static legality context once per top-level invocation and reuse it across recursive option probes.
  - Kept per-probe preflight and evaluation steps dynamic to preserve correctness for probe-specific bindings.
  - Added a probe-context instrumentation hook (`onProbeContextPrepared`) and a new unit test validating single context preparation for a probed `chooseN` request.
- Deviations from original plan:
  - No integration/runner test logic changes were needed; existing tests already covered semantic invariants and passed unchanged.
- Verification:
  - `pnpm turbo build`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`
