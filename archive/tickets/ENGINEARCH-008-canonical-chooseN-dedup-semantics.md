# ENGINEARCH-008: Canonical chooseN Dedup Semantics

**Status**: ✅ COMPLETED
**Priority**: P1
**Depends on**: ENGINEARCH-006 (`archive/tickets/ENGINEARCH-006-canonical-option-policy-consolidation.md`)

---

## Summary

Finalize canonical duplicate-handling semantics for `chooseN` option values so satisfiability probing, deterministic resolution, and agent template completion all treat `chooseN` as a unique-selection set.

---

## Reassessed Assumptions (2026-02-18)

- Shared policy already exists in `packages/engine/src/kernel/choice-option-policy.ts` and already defines dedup behavior for `chooseN` via `selectUniqueChoiceOptionValuesByLegalityPrecedence`.
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` already uses the deduped `chooseN` selector path.
- `packages/engine/src/kernel/move-decision-sequence.ts` already resolves default deterministic `chooseN` choices through `pickDeterministicChoiceValue`, which dedupes.
- Remaining architecture divergence is in `packages/engine/src/agents/template-completion.ts`, which currently uses `selectChoiceOptionValuesByLegalityPrecedence` for both `chooseOne` and `chooseN`.
- Runtime contract already enforces unique `chooseN` selections in `packages/engine/src/kernel/effects-choice.ts` (`chooseN selections must be unique`), so preserving duplicates in template completion is inconsistent and can generate avoidable invalid candidates.
- Existing tests in `packages/engine/test/unit/kernel/choice-option-policy.test.ts` already assert `chooseN` dedup semantics at policy level.

---

## Scope (Updated)

- Keep canonical `chooseN` semantics as **deduped unique value set** (not duplicate-preserving multiset).
- Make `template-completion` use the same canonical `chooseN` dedup policy already used by kernel satisfiability and deterministic decision resolution.
- Add/expand parity tests so agent template completion (`RandomAgent`/`GreedyAgent`) cannot regress to duplicate-preserving `chooseN` behavior.
- Keep change surgical: no game-specific logic, no backward-compatibility aliases, no refactor outside the choice-selection policy call path.

---

## Architectural Rationale

- `chooseN` semantically represents selecting a subset with cardinality constraints; duplicate picks do not represent additional distinct choices.
- Deduped canonical semantics align every layer with the runtime invariant that `chooseN` selections must be unique.
- Unifying on dedup reduces invalid candidate generation and policy drift, improving long-term maintainability and auditability from one policy module.

---

## Invariants That Should Pass

- `chooseN` duplicate handling is identical across runtime resolution, satisfiability probing, deterministic kernel completion, and agent template completion.
- Policy changes require editing one shared module, not multiple divergent callsites.
- Determinism remains stable under fixed seed/input after policy unification.

---

## Tests That Should Pass

- Keep policy-level invariants green in:
  - `packages/engine/test/unit/kernel/choice-option-policy.test.ts`
- Add/expand parity coverage in:
  - `packages/engine/test/unit/agents/random-agent.test.ts`
  - `packages/engine/test/unit/agents/greedy-agent-core.test.ts`
- Keep kernel decision helpers green:
  - `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts`
  - `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
- Quality gates:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`

---

## Outcome

- Completion date: 2026-02-18
- What changed:
  - Updated `packages/engine/src/agents/template-completion.ts` so `chooseN` uses `selectUniqueChoiceOptionValuesByLegalityPrecedence` while `chooseOne` remains on scalar selection policy.
  - Added `chooseN` duplicate-parity coverage in:
    - `packages/engine/test/unit/agents/random-agent.test.ts`
    - `packages/engine/test/unit/agents/greedy-agent-core.test.ts`
- Deviations from original plan:
  - Kernel files `decision-sequence-satisfiability` and `move-decision-sequence` required no implementation changes because they were already using canonical dedup semantics; only assumption/scope corrections were applied.
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/agents/random-agent.test.js packages/engine/dist/test/unit/agents/greedy-agent-core.test.js packages/engine/dist/test/unit/kernel/choice-option-policy.test.js packages/engine/dist/test/unit/kernel/decision-sequence-satisfiability.test.js packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine typecheck` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
