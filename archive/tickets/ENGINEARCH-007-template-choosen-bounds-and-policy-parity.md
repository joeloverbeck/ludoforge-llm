# ENGINEARCH-007: Template chooseN Bounds and Policy Parity

**Status**: ✅ COMPLETED
**Priority**: P1
**Depends on**: ENGINEARCH-006 (`archive/tickets/ENGINEARCH-006-canonical-option-policy-consolidation.md`)

---

## Summary

Harden template `chooseN` completion so RNG cardinality is always computed from post-policy selectable options and never exceeds selectable bounds.

---

## Reassessed Assumptions (Current Code/Test Reality)

- `packages/engine/src/agents/template-completion.ts` already delegates option legality precedence to `selectChoiceOptionValuesByLegalityPrecedence(...)`; policy parity is partially implemented.
- `completeTemplateMove(...)` already returns `null` for unplayable branches when selectable options are empty or below `min`.
- The remaining defect is cardinality bound normalization: `selectFromChooseN(...)` uses raw `choices.max` without clamping to post-policy selectable option count, allowing `count > options.length`.
- This can trigger invalid RNG bounds in the partial shuffle loop (for example, when downstream legality filtering removes options).
- There is no dedicated `template-completion` unit test file; current coverage is indirect through random/greedy agent tests and misses this edge case.

---

## Scope Update

1. Keep legality precedence ownership in shared kernel policy helpers; avoid new agent-local legality logic.
2. Clamp template `chooseN` RNG bounds against post-policy selectable option count before drawing selection count.
3. Preserve existing contract: return `null` for unplayable template branches, never throw range errors from chooser bounds.
4. Add direct unit tests for template completion edge cases and keep existing random/greedy agent tests green.

---

## Architecture Decision

Prefer post-policy bound normalization at template-completion time over trusting declared cardinality bounds. This is the most robust and extensible design because legality filtering is dynamic and can shrink selectable domains after profile/cardinality declaration.

---

## What Needs to Change

- In `packages/engine/src/agents/template-completion.ts`, clamp `chooseN` bounds to selectable option count after legality precedence filtering.
- Prevent template selection-count draws that imply `count > options.length`, eliminating downstream invalid RNG bounds during partial shuffle.
- Keep option selection semantics delegated to canonical policy helpers (no local policy forks or alias semantics).
- Ensure unplayable template branches still return `null`.

---

## Invariants That Should Pass

- Template completion never throws due to invalid `chooseN` RNG bounds after legality filtering.
- `chooseN` completion selects only values returned by canonical legality precedence helper (`legal` > `unknown`; no illegal fallback by default).
- For pending decisions where selectable options are insufficient for `min`, template completion returns `null`.
- Template completion remains deterministic for fixed seed/input.

---

## Tests That Should Pass

- Add direct unit tests for `packages/engine/src/agents/template-completion.ts` in `packages/engine/test/unit/agents/template-completion.test.ts`:
  - `chooseN` with declared `max` greater than selectable option count does not throw.
  - `chooseN` with `min` greater than selectable option count returns `null`.
  - `chooseN` selections always stay within the selectable option domain.
- Existing agent tests remain green:
  - `packages/engine/test/unit/agents/random-agent.test.ts`
  - `packages/engine/test/unit/agents/greedy-agent-core.test.ts`
- Engine quality gates:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
- Updated `packages/engine/src/agents/template-completion.ts` to clamp `chooseN` max bounds against selectable option count before RNG draw, preventing `count > options.length` and downstream invalid RNG bounds.
- Refactored template completion selection flow to compute selectable options once per pending decision and reuse them for selection.
- Added direct unit tests in `packages/engine/test/unit/agents/template-completion.test.ts` covering bound clamping, unsatisfiable `min`, and in-domain selection invariants across many seeds.
- **Deviations from original plan**:
- Scope was tightened from broad "policy parity" wording to the concrete open defect: post-policy `chooseN` bound normalization and explicit direct test coverage.
- **Verification**:
- `pnpm -F @ludoforge/engine test` passed.
- `pnpm -F @ludoforge/engine typecheck` passed.
- `pnpm -F @ludoforge/engine lint` passed.
