# FITLEVENTARCH-003: Sound Discovery Semantics for rollRandom-Gated Decisions

**Status**: COMPLETED (2026-03-07)
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — discovery semantics in effect execution plus stochastic pending contract propagation
**Deps**: archive/tickets/FITLEVENTARCH-002-choice-validation-error-classification.md, specs/29-fitl-event-card-encoding.md, reports/fire-in-the-lake-rules-section-5.md

## Problem

`resolveMoveDecisionSequence` can incorrectly report `complete: true` for moves whose required decisions are nested under `rollRandom`. In discovery mode, `applyRollRandom` currently short-circuits and does not evaluate nested effects, so required `chooseOne`/`chooseN` prompts are invisible during probing. Runtime execution then fails with `choiceRuntimeValidationFailed` (`missing move param binding`) when the rolled branch requires a decision.

This produces unsound move completion and forces test/workflow workarounds that parse runtime error messages to recover decision IDs.

## Assumption Reassessment (2026-03-07)

1. `packages/engine/src/kernel/effects-choice.ts` still returns early for `rollRandom` when `ctx.mode === 'discovery'`, bypassing nested effects entirely.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` currently codifies this unsound behavior (`returns complete before inner choices`).
3. `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` currently relies on runtime error parsing to extract the missing decision ID for card-42.
4. Direct move-decision-sequence unit coverage lives at `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (not `packages/engine/test/unit/move-decision-sequence.test.ts`).

## Architecture Decision

1. Discovery/probing must be conservative and deterministic relative to runtime requirements.
2. The clean engine-level fix is to explore bounded `rollRandom` outcomes during discovery and surface unresolved decisions instead of claiming completion.
3. To keep architecture robust without broad type churn, this ticket keeps the existing `ChoicePendingRequest` contract and merges stochastic discovery into a deterministic pending request using conservative rules.
4. No game-specific logic, no aliases, no compatibility shims.

## Scope and Implementation Plan

### 1. Implement stochastic-aware discovery in `applyRollRandom`

In discovery mode:
- evaluate `min..max` bounds exactly as runtime does,
- probe nested effects for each bounded outcome,
- collect unresolved pending decisions,
- if no unresolved decision exists across outcomes, preserve current no-op discovery behavior,
- if unresolved decisions exist, return a deterministic merged pending request.

Merge policy:
- deterministic branch ordering by roll outcome (`min..max` ascending),
- deterministic pending selection by decision identity,
- conservative option/cardinality merge (only values/cardinality safe across contributing outcomes),
- never return `complete` when any outcome has unresolved required decisions.

### 2. Keep completion and satisfiability consumers unchanged unless required

`resolveMoveDecisionSequence`, `legalChoicesDiscover`, and satisfiability classification already consume discovery output. They should inherit correct behavior from (1) with no architectural duplication.

Only touch consumer code if tests prove a concrete contract break.

### 3. Remove workaround-style integration behavior

Update Chou En Lai integration coverage to complete decision sequences through canonical discovery-driven APIs instead of runtime-error parsing.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/effects-choice.test.ts` (modify)
- `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` (modify)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify)
- `packages/engine/test/helpers/legality-surface-parity-helpers.ts` (modify)

## Out of Scope

- Changing event card rules text/content
- Runner/UI formatting of legality errors
- Broad `ChoiceRequest` type redesign
- Non-stochastic decision-sequence behavior unrelated to `rollRandom`

## Acceptance Criteria

### Tests That Must Pass

1. Discovery/probing for `rollRandom`-gated choices no longer returns `complete: true` when any bounded outcome may require unresolved decisions.
2. `resolveMoveDecisionSequence` no longer false-completes stochastic-gated choices.
3. FITL card-42 coverage no longer depends on runtime-error parsing to resolve event decision params.
4. Existing suite remains green: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Discovery remains deterministic for identical `(def, state, move, budgets)` inputs.
2. Kernel logic remains game-agnostic; no card-specific branching.
3. If stochastic outcomes cannot be safely auto-resolved by deterministic chooser policy, probing must remain incomplete instead of unsafely completing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-choice.test.ts` — discovery-mode `rollRandom` nested-choice propagation and conservative merge behavior.
2. `packages/engine/test/unit/effects-choice.test.ts` — new stochastic-alternative regression when different roll outcomes require different decision IDs.
3. `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` — classify stochastic pending as `unknown`.
4. `packages/engine/test/unit/kernel/legal-choices.test.ts` — update outdated expectation that `rollRandom` discovery stops traversal.
5. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — regressions for no false `complete` and for explicit stochastic decision alternatives.
6. `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` — remove runtime-error-parsing workaround and validate canonical decision-sequence completion.
7. `packages/engine/test/integration/decision-sequence.test.ts` — strengthen pending-kind narrowing with expanded request union.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-choice.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
5. `node --test packages/engine/dist/test/integration/fitl-events-chou-en-lai.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- Implemented discovery-time stochastic probing for `rollRandom` in `packages/engine/src/kernel/effects-choice.ts` by evaluating bounded outcomes and surfacing deterministic conservative pending decisions instead of returning unconditional completion.
- Implemented first-class stochastic uncertainty contract (`kind: pendingStochastic`) so discovery can represent alternative unresolved decision requests explicitly when roll outcomes diverge.
- Performed targeted contract propagation (`types-core`, `effect-context`, `move-decision-sequence`, `decision-sequence-satisfiability`, `move-completion`, `apply-move`) to keep stochastic uncertainty explicit and type-safe across kernel surfaces.
- Updated/added regression tests across unit and integration layers, including replacing card-42 runtime-error parsing with canonical discovery-driven decision completion.
