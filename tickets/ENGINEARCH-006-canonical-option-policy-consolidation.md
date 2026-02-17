# ENGINEARCH-006: Canonical Option Policy Consolidation

**Status**: PENDING
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P2
**Depends on**: ENGINEARCH-004
**Estimated complexity**: M

---

## Summary

Consolidate duplicated option-selection and legality-preference logic into one kernel policy module used by runtime, agents, and helper flows.

---

## What Needs to Change

- Extract canonical option policy utilities in engine kernel (for example: selectable-option filtering, legality precedence, deterministic pick strategy).
- Replace duplicated inline logic in:
  - `move-decision-sequence`,
  - `template-completion`,
  - shared engine helper utilities that mirror runtime policy.
- Define one explicit legality precedence policy (for example legal-first, then unknown, never illegal unless explicitly requested).
- Keep policy independent of game content and fully driven by canonical option metadata.

---

## Invariants That Should Pass

- Option selection behavior is consistent across move decision sequencing, template completion, and test harness helpers.
- Deterministic paths remain deterministic under fixed seed/input.
- Illegal options are not selected by default policy.
- Policy changes require touching one shared module, not many call sites.

---

## Tests That Should Pass

- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
  - assert default chooser follows canonical legality precedence.
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
