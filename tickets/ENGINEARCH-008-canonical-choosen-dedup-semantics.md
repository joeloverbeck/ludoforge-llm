# ENGINEARCH-008: Canonical chooseN Dedup Semantics

**Status**: PENDING
**Priority**: P1
**Depends on**: ENGINEARCH-006

---

## Summary

Define and enforce one canonical duplicate-handling policy for `chooseN` option values across satisfiability, deterministic resolution, and template completion.

---

## What Needs to Change

- Decide and codify canonical `chooseN` duplicate semantics in shared policy (dedup or preserve duplicates) with no surface-specific divergence.
- Ensure `packages/engine/src/kernel/choice-option-policy.ts` is the single source of truth for `chooseN` selectable value shape.
- Remove any remaining `chooseN` duplicate-handling logic divergence in:
  - `packages/engine/src/kernel/decision-sequence-satisfiability.ts`
  - `packages/engine/src/kernel/move-decision-sequence.ts`
  - `packages/engine/src/agents/template-completion.ts`
- Document chosen policy in code comments/tests so behavior is explicit and auditable.

---

## Invariants That Should Pass

- `chooseN` duplicate handling is identical across runtime resolution, satisfiability probing, and agent template completion.
- Policy changes require editing one shared module, not multiple callsites.
- Determinism remains stable under fixed seed/input after policy unification.

---

## Tests That Should Pass

- Add/expand policy-focused tests in:
  - `packages/engine/test/unit/kernel/choice-option-policy.test.ts`
  - `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts`
  - `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
- Add agent-level parity tests ensuring template completion matches canonical `chooseN` duplicate semantics:
  - `packages/engine/test/unit/agents/random-agent.test.ts`
  - `packages/engine/test/unit/agents/greedy-agent-core.test.ts`
- Quality gates:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`
