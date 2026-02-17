# ENGINEARCH-003: Legality Probe Context Reuse and Scalability

**Status**: PENDING
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P2
**Depends on**: ENGINEARCH-001, ENGINEARCH-002
**Estimated complexity**: M

---

## Summary

Refactor legality probing so repeated option checks reuse precomputed evaluation context and avoid repeated full `legalChoices` setup per probe.

---

## What Needs to Fix

- Extract reusable legality-probe context from `legalChoices` in `packages/engine/src/kernel/legal-choices.ts` so probing does not rebuild adjacency graph/runtime table/preflight on each option check.
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
  - extend/adjust tests to verify unchanged legality outcomes across chooseOne and chooseN probes.
  - add regression for deferred pipeline legality/costValidation with probing.
- `packages/engine/test/integration/decision-sequence.test.ts`
  - ensure decision sequencing semantics remain unchanged after probe refactor.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - confirm runner legality projections are unchanged semantically.
- Existing suites remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`

