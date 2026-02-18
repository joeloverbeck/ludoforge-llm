# ENGINEARCH-007: Template chooseN Bounds and Policy Parity

**Status**: PENDING
**Priority**: P1
**Depends on**: ENGINEARCH-006

---

## Summary

Fix template move completion for `chooseN` so random selection never exceeds selectable option bounds and matches canonical option-policy semantics.

---

## What Needs to Change

- In `packages/engine/src/agents/template-completion.ts`, clamp `chooseN` selection bounds against the actual selectable option count after legality precedence filtering.
- Prevent `nextInt(min, max)` calls where `min > max` during template `chooseN` completion.
- Align template `chooseN` option handling with canonical policy semantics (including duplicate-value behavior chosen by policy).
- Ensure failure mode for unplayable template branches is `null` (skip template), not thrown range errors.

---

## Invariants That Should Pass

- Template completion must never throw due to invalid RNG bounds caused by `chooseN` cardinality mismatch.
- `chooseN` completion must select only values permitted by canonical legality precedence (`legal` > `unknown`; no illegal by default).
- For any pending decision where selectable options are insufficient for `min`, template completion returns `null` deterministically.
- Agent template completion remains deterministic for fixed seed/input.

---

## Tests That Should Pass

- Add/expand unit tests for `packages/engine/src/agents/template-completion.ts`:
  - `chooseN` with declared `max` greater than selectable option count does not throw.
  - `chooseN` with `min` greater than selectable option count returns `null`.
  - mixed legality options only produce legal/unknown selections per policy.
- Existing agent tests remain green:
  - `packages/engine/test/unit/agents/random-agent.test.ts`
  - `packages/engine/test/unit/agents/greedy-agent-core.test.ts`
- Engine quality gates:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`
