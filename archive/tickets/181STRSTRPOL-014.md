# 181STRSTRPOL-014: Phase 1 prerequisite — microturn selector option context

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic policy selector runtime and focused tests
**Deps**: `archive/tickets/181STRSTRPOL-006.md`, `archive/tickets/181STRSTRPOL-007.md`, `archive/tickets/181STRSTRPOL-008.md`, `archive/tickets/181STRSTRPOL-011.md`

## Problem

Ticket 012 must migrate one ARVN target-ranking consideration to selectors while remaining YAML-only. Live reassessment showed the current ARVN target decisions are microturn option choices, not move-scope action-family scalars. The selector IR already declares `source: { kind: microturnOptions }`, but microturn option scoring does not yet provide the published option frontier to selector evaluation or expose a current-option selector ref that can score each option.

Without this prerequisite, a YAML-only 012 migration would either be hollow or would not address target ranking. This ticket completes the generic runtime contract first, aligned with Foundations #10, #15, and #16.

## What to Change

1. In microturn option scoring, provide the currently published selectable option frontier to selector evaluation in deterministic order.
2. Evaluate selector quality components against each microturn option item, so refs such as `microturn.option.value`, `microturn.option.index`, and `microturn.option.stableKey` refer to the selector item being scored.
3. Add current-option selector refs so a microturn consideration can score the option currently being evaluated:
   - `selector.<id>.current.matches`
   - `selector.<id>.current.quality`
   - `selector.<id>.current.rank`
   - `selector.<id>.current.component.<componentId>`
4. Keep the change generic. No FITL-specific branches and no ARVN YAML changes in this ticket.

## Acceptance Criteria

1. A microturn selector over `microturnOptions` ranks the published options deterministically.
2. A microturn consideration can use `selector.<id>.current.quality` to score the currently evaluated option.
3. Existing selector refs keep their current meaning.
4. Compiler/schema support accepts the new `current.*` selector refs.
5. Focused unit tests pass.

## Test Plan

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/microturn-option-evaluator.test.js packages/engine/dist/test/unit/agents/policy-selector-eval.test.js packages/engine/dist/test/unit/cnl/agent-selector-ir.test.js`
3. `pnpm -F @ludoforge/engine test -- microturn-option-evaluator.test.ts`
4. `pnpm -F @ludoforge/engine run schema:artifacts:check`

## Outcome

Implemented the generic microturn selector context prerequisite:

- `scoreMicroturnOptionWithContributions` now passes the published selectable microturn frontier into selector evaluation.
- `microturnOptions` selector sources now carry each option's value and index so quality components evaluate refs such as `microturn.option.value`, `microturn.option.index`, and `microturn.option.stableKey` against the selector item being scored.
- `selector.<id>.current.*` refs are compiled, schema-backed, and resolved at runtime for the currently scored microturn option.
- Current-option quality/rank are computed from the full deterministic ranking, while existing `selected.*` refs keep their previous top-result meaning.
- The schema artifact was regenerated for the new selector ref variants.

No FITL/ARVN profile YAML changed in this prerequisite ticket.

## Verification

- `pnpm -F @ludoforge/engine build` — pass.
- `node --test packages/engine/dist/test/unit/agents/microturn-option-evaluator.test.js packages/engine/dist/test/unit/agents/policy-selector-eval.test.js packages/engine/dist/test/unit/cnl/agent-selector-ir.test.js` — pass.
- `pnpm -F @ludoforge/engine test -- microturn-option-evaluator.test.ts` — pass.
- `pnpm -F @ludoforge/engine test -- microturn-option-evaluator.test.ts policy-selector-eval.test.ts agent-selector-ir.test.ts` — pass.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — pass.
- `pnpm run check:ticket-deps` — pass.
- `git diff --check` — pass.
- `pnpm turbo build` — pass.
- `pnpm turbo lint` — pass.
- `pnpm turbo typecheck` — pass.
