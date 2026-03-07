# FITLEVENTARCH-003: Sound Discovery Semantics for rollRandom-Gated Decisions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — discovery semantics in effect execution, decision-sequence completion, legality probing, test helpers
**Deps**: tickets/FITLEVENTARCH-002-choice-validation-error-classification.md, specs/29-fitl-event-card-encoding.md, reports/fire-in-the-lake-rules-section-5.md

## Problem

`resolveMoveDecisionSequence` can incorrectly report `complete: true` for moves whose required decisions are nested under `rollRandom`. In discovery mode, `applyRollRandom` currently short-circuits and does not evaluate nested effects, so required `chooseOne`/`chooseN` prompts are invisible during probing. Runtime execution then fails with `choiceRuntimeValidationFailed` (`missing move param binding`) when the rolled branch requires a decision.

This produces unsound move completion and forces test/workflow workarounds that parse runtime error messages to extract decision IDs.

## Assumption Reassessment (2026-03-07)

1. `packages/engine/src/kernel/effects-choice.ts` currently returns early for `rollRandom` when `ctx.mode === 'discovery'`, bypassing all nested effects.
2. `packages/engine/src/kernel/move-decision-sequence.ts` depends on discovery output and deterministic chooser policy; if no pending decision is surfaced, it returns `complete: true`.
3. FITL `card-42` (Chou En Lai) reproduces this mismatch: probing can report completion while runtime requires a `chooseN` removal selection after die roll resolution.

## Architecture Check

1. Discovery/probing must be semantically sound relative to runtime requirements. A conservative, game-agnostic stochastic discovery model is cleaner than card-specific workarounds.
2. The fix remains entirely engine-level and generic: no FITL branching in kernel code, no game-specific special cases in `GameDef`/runtime.
3. No backwards-compatibility shims: define one canonical behavior where discovery never claims completion if any stochastic branch can require unresolved decisions.

## What to Change

### 1. Implement stochastic-aware discovery for `rollRandom`

Replace discovery short-circuit behavior in `applyRollRandom` with conservative exploration semantics:
- Evaluate nested effects under bounded roll outcomes (`min..max`) using discovery probe context.
- Merge pending decision requirements across outcomes.
- If any outcome requires unresolved decision(s), surface that requirement to discovery callers instead of returning complete.

Define deterministic merge rules for:
- same decision id with varying cardinality/options
- differing decision ids across outcomes
- outcome sets with both `complete` and `pending`

### 2. Tighten move-decision completion contract under stochastic uncertainty

Update `resolveMoveDecisionSequence` (and any helper wrappers) so it does not auto-complete when discovery indicates stochastic unresolved decisions. Ensure returned `nextDecision` is actionable and stable for callers.

### 3. Align legality/satisfiability probing with new stochastic model

Update `legal-choices` and satisfiability classification integration so probing remains deterministic, budget-aware, and conservative under stochastic branching.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify, if discovery payload shape needs extension)
- `packages/engine/test/unit/effects-choice.test.ts` (modify)
- `packages/engine/test/unit/move-decision-sequence.test.ts` (new or modify nearest suite)
- `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` (modify)

## Out of Scope

- Changing event card rules text/content
- Runner/UI formatting of legality errors
- Non-stochastic decision-sequence behavior unrelated to `rollRandom`

## Acceptance Criteria

### Tests That Must Pass

1. Discovery/probing for moves with `rollRandom`-gated choices no longer returns `complete: true` when runtime may require unresolved decisions.
2. `resolveMoveDecisionSequence` returns actionable unresolved decision payloads for stochastic-gated choices without requiring runtime-error parsing.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Decision-sequence probing remains game-agnostic and deterministic for identical `(def, state, move, budgets)` inputs.
2. No card-specific branching is introduced in kernel discovery logic.

## Tests

1. Add targeted unit coverage for `rollRandom` discovery behavior when nested choices are conditionally required.
2. Add/extend move-decision-sequence tests for stochastic unresolved decision handling.
3. Add integration regression for FITL `card-42` to prove no runtime-error parsing is needed to complete scripted move resolution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-choice.test.ts` — discovery-mode `rollRandom` nested-choice propagation.
2. `packages/engine/test/unit/move-decision-sequence.test.ts` — no false `complete` under stochastic-gated choices.
3. `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` — replace workaround with canonical decision-sequence completion path.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-choice.test.js`
3. `node --test packages/engine/dist/test/unit/move-decision-sequence.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-chou-en-lai.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
