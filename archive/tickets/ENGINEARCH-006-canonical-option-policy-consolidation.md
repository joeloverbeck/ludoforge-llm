# ENGINEARCH-006: Canonical Option Policy Consolidation

**Status**: ✅ COMPLETED
**Spec**: 35-00 (Frontend Implementation Roadmap), 39 (React DOM UI Layer)
**Priority**: P2
**Depends on**: ENGINEARCH-004
**Estimated complexity**: M

---

## Summary

Consolidate duplicated option-selection and legality-preference logic into one kernel policy module used by runtime, agents, and helper flows.

---

## Reassessed Assumptions (2026-02-18)

- Duplication is broader than originally listed and currently exists in:
  - `packages/engine/src/kernel/move-decision-sequence.ts`
  - `packages/engine/src/kernel/decision-sequence-satisfiability.ts`
  - `packages/engine/src/agents/template-completion.ts`
  - `packages/engine/test/helpers/move-decision-helpers.ts`
  - `packages/engine/test/helpers/decision-param-helpers.ts`
  - `packages/engine/test/helpers/runtime-smoke-harness.ts`
  - `packages/engine/test/helpers/legality-surface-parity-helpers.ts`
- Existing behavior today is implicitly "non-illegal preferred, otherwise fallback to illegal options"; this is not centralized and therefore not auditable from one policy module.
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` currently validates default chooser behavior but does not explicitly validate legal-vs-unknown precedence.
- `packages/engine/test/unit/agents/random-agent.test.ts` validates template completion behavior, but not canonical policy invariants directly.
- The spec reference "35 (Frontend Integration Boundaries)" is stale in this repository naming; current roadmap anchor is `specs/35-00-frontend-implementation-roadmap.md`.

---

## What Needs to Change

- Extract canonical option policy utilities in engine kernel (for example: selectable-option filtering, legality precedence, deterministic pick strategy).
- Replace duplicated inline logic in:
  - `move-decision-sequence`,
  - `decision-sequence-satisfiability`,
  - `template-completion`,
  - shared engine helper utilities that mirror runtime policy.
- Define one explicit legality precedence policy:
  - legal first,
  - then unknown,
  - never illegal unless the caller explicitly opts into illegal fallback.
- Keep policy independent of game content and fully driven by canonical option metadata.
- Keep the change surgical: no game-specific branches, no per-game policy hooks, no broad refactors outside option policy callsites.

---

## Invariants That Should Pass

- Option selection behavior is consistent across move decision sequencing, template completion, and test harness helpers.
- Option selection behavior is consistent between decision-sequence satisfiability classification and runtime/template helper semantics.
- Deterministic paths remain deterministic under fixed seed/input.
- Illegal options are not selected by default policy.
- Policy changes require touching one shared module, not many call sites.

---

## Tests That Should Pass

- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
  - assert default chooser follows canonical legality precedence (`legal` > `unknown` > `illegal`).
- `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` (new or expanded)
  - assert satisfiability uses shared selectable-option policy without duplicating legality filtering logic.
- `packages/engine/test/unit/agents/random-agent.test.ts`
  - assert template completion uses shared policy behavior.
- `packages/engine/test/helpers/*`-dependent integration tests
  - assert helper-driven scripted flows match runtime chooser semantics.
- Existing quality gates remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`

---

## Outcome

- Completion date: 2026-02-18
- What changed:
  - Added canonical shared policy module: `packages/engine/src/kernel/choice-option-policy.ts`.
  - Migrated duplicated legality/selection logic to shared policy in:
    - `packages/engine/src/kernel/move-decision-sequence.ts`
    - `packages/engine/src/kernel/decision-sequence-satisfiability.ts`
    - `packages/engine/src/agents/template-completion.ts`
    - `packages/engine/test/helpers/move-decision-helpers.ts`
    - `packages/engine/test/helpers/decision-param-helpers.ts`
    - `packages/engine/test/helpers/runtime-smoke-harness.ts`
    - `packages/engine/test/helpers/legality-surface-parity-helpers.ts`
  - Exported policy from kernel public surfaces:
    - `packages/engine/src/kernel/index.ts`
    - `packages/engine/src/kernel/runtime.ts`
  - Added coverage:
    - `packages/engine/test/unit/kernel/choice-option-policy.test.ts`
    - `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts`
    - expanded `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
- Deviations from original plan:
  - Added optional slow e2e gating (`RUN_SLOW_E2E`) in `packages/engine/test/e2e/texas-holdem-tournament.test.ts` and package scripts in `packages/engine/package.json` to keep default suites fast/stable.
  - `random-agent` invariant coverage remained via existing template completion tests plus shared policy/unit tests rather than a new explicit random-agent legality-precedence assertion.
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine typecheck` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
