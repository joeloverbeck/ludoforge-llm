# Spec 121: Two-Phase Policy Evaluation

**Status**: COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 15 (GameSpec Authored Agent Policy IR)
**Source**: `fitl-arvn-agent-evolution` campaign (April 2026) — 17 experiments formally run via `improve-loop` skill demonstrating completion-scope → move-scope entanglement. Detailed experiment data was lost in squash-merge; the observations documented below (e.g., exp-009 trace) are the surviving evidence.

## Overview

Separate the PolicyAgent's evaluation pipeline into two distinct phases:

1. **Move-scope phase**: Score template actions (pre-completion) using move-scope considerations only. Select the winning action (by `actionId`).
2. **Completion-scope phase**: Complete only the winning action's inner decisions using completion-scope considerations.

This eliminates the current entanglement where adding a completion-scope consideration can change which action TYPE is selected — a coupling that directly caused campaign failures and violates the principle of clean decision-level separation.

## Problem Statement

The current `PolicyAgent.chooseMove` pipeline operates in a single pass:

```
For EACH legal move template:
  1. Complete inner decisions using completion-scope scoring (buildCompletionChooseCallback)
  2. Produce a fully completed move with specific parameter values
Then score ALL completed moves using move-scope considerations
Select the highest-scoring completed move
```

This entangles two logically distinct decision levels:

- **Strategic intent** (which `actionId` to take): "Should ARVN Govern, Train, or Sweep?"
- **Tactical execution** (how to parameterize that action): "Which province should ARVN Govern in?"

### Evidence from fitl-arvn-agent-evolution campaign

**exp-009**: Adding `preferPopulousTargets` (a completion-scoped consideration that scores target zone selection by population) changed ARVN's first MOVE from `govern` to `sweep`.

Root cause trace:
1. Without `preferPopulousTargets`, template completion uses PRNG to pick target zones. `govern` targeting zone A gets projected margin -13 → move-scope score -35.6 (winning).
2. With `preferPopulousTargets`, template completion picks zone B (higher population). `govern` targeting zone B gets projected margin -15 → move-scope score -39.6. Meanwhile `sweep` targeting a populous zone gets a better projected margin → score -38.1 → `sweep` now beats `govern`.
3. ARVN sweeps instead of governs → completely different game trajectory → VC wins quickly (margin -7 vs margin 0 baseline).

The completion-scope consideration was only intended to improve WITHIN-ACTION target selection. Instead, it disrupted the ACROSS-ACTION strategic decision. This is architecturally unsound — a target-selection heuristic should not override a strategic preference.

### Why this matters for evolution

The system exists for profile evolution (Foundation 2). Evolution campaigns need to add completion-scope considerations to improve target selection quality WITHOUT risking action-type regressions. The current entanglement makes it impossible to safely evolve one decision level independently.

## Goals

- Separate move-scope evaluation (action type selection) from completion-scope evaluation (parameter selection).
- Ensure adding a completion-scope consideration CANNOT change which `actionId` is selected.
- Maintain determinism, bounded computation, and trace auditability.
- Preserve backward compatibility: profiles without completion-scope considerations behave identically.
- Improve performance: only complete templates for the winning action type, not all templates.

## Non-Goals

- Multi-step lookahead or planning.
- Profile inheritance or conditional profile switching.
- Changes to the DSL authoring surface (considerations, pruning rules, tie-breakers keep their current syntax).
- Changes to how completion-scope scoring works internally (the `scoreCompletionOption` evaluator is unchanged).

## Architectural Decisions

### 1. Move-scope scoring uses pre-completion state

In Phase 1, each template action is scored using move-scope considerations against the **pre-completion game state** — the state as-is, before any inner decisions are resolved. Preview evaluation still works: the preview system already handles incomplete templates by evaluating the action's "best-case" or "representative" projected state.

For templates where preview cannot evaluate (because target zones are unresolved), considerations authored with the `projectedSelfMargin` pattern use the `coalesce` operator (in `policy-evaluation-core.ts`) to fall back to the static margin. This is the same behavior as today when preview fails.

### 2. Only the winning action type gets completion-scored

After Phase 1 selects the best action type (or top-N for tie-breaking purposes), Phase 2 completes only those templates using the completion-scope callback. This is both architecturally cleaner and more performant — no wasted completion work for losing action types.

### 3. Tie-breaking across action types uses the same move-scope scores

If multiple `actionId`s tie on move-scope score, tie-breakers (including `stableMoveKey`) resolve the tie before Phase 2. Only the single winning template enters completion.

### 4. Multiple templates of the same `actionId`

When multiple templates share an `actionId` (e.g., `govern` with different valid target sets), all templates of the winning `actionId` enter Phase 2. The final selection among them uses the move-scope score plus completion-scope quality.

### 5. Backward compatibility: single-scope profiles are unchanged

If a profile has no completion-scope considerations, Phase 2 uses PRNG for inner decisions (identical to current behavior without a `choose` callback). The move-scope evaluation in Phase 1 produces the same scores as today. Behavior is identical.

## Proposed Pipeline

```
PolicyAgent.chooseMove(input):

  Phase 1 — Move-scope evaluation (action type selection):
    1. For each legal move template:
       - Evaluate move-scope considerations against pre-completion state
       - Compute move-scope score
    2. Apply pruning rules (move-scope only)
    3. Apply tie-breakers
    4. Select winning `actionId` (or top-K tied `actionId`s)

  Phase 2 — Completion-scope evaluation (parameter selection):
    5. For each template of the winning `actionId`:
       - Complete inner decisions using completion-scope callback
       - Produce fully completed move
    6. Among completed variants, select by:
       a. Completion-scope score (higher = better target selection)
       b. Move-scope tie-breakers if still tied
    7. Return the final completed move
```

## Changes Required

### `packages/engine/src/agents/policy-agent.ts`

Restructure `chooseMove`:
- Phase 1: call `evaluatePolicyMove` with **template moves** (not completed moves). Move-scope considerations already handle undefined candidate params via `coalesce`.
- Phase 2: call `preparePlayableMoves` with completion callback, but only for templates matching the winning `actionId`.

### `packages/engine/src/agents/policy-eval.ts`

- `evaluatePolicyMoveCore`: accept template moves (with unresolved inner decisions). **Existing infrastructure**: `evaluatePolicyMoveCore` already filters considerations by `scopes?.includes('move')` (line ~490), so Phase 1 leverages existing scope filtering rather than introducing it. Move-scope considerations that reference `candidate.param.*` already use `coalesce` for undefined params — no change needed.
- Pruning rules: must work on template moves. Most pruning rules check `candidate.actionId` which is available on templates. Rules that check `candidate.param.*` need the same `coalesce` treatment.

### `packages/engine/src/agents/prepare-playable-moves.ts`

- Add an option to filter which templates to complete (by `actionId` or by a predicate).
- Return completion statistics per `actionId`.

### `packages/engine/src/agents/completion-guidance-choice.ts`

No changes needed — the callback is already scoped to completion decisions.

### `packages/engine/src/agents/policy-diagnostics.ts`

- Update `buildPolicyAgentDecisionTrace` to populate the new phase fields (`phase1Score`, `phase2Score`, `phase1ActionRanking`) from the extended `PolicyEvaluationMetadata`.

### Trace output

- Add `phase1Score` and `phase2Score` to the agent decision trace to show which phase drove the decision.
- Add `phase1ActionRanking` to show the `actionId` ranking before completion.

## Testing Strategy

### Unit tests

1. **Isolation test**: Profile with completion-scope considerations produces the same `actionId` selection as the same profile without them. (This is the core property being enforced.)
2. **Phase 1 determinism**: Same input → same `actionId` ranking, regardless of completion-scope considerations.
3. **Phase 2 quality**: Completion-scope considerations improve parameter selection within the winning `actionId`.
4. **Backward compatibility**: Profile with no completion-scope considerations produces identical results to current behavior.
5. **Performance**: Phase 2 only completes templates for the winning type (measure template completion count reduction).

### Integration tests

6. **FITL regression**: Run the `fitl-arvn-agent-evolution` harness with the exp-001 profile + `preferPopulousTargets`. Verify that ARVN still selects `govern` as first action (not `sweep`).
7. **VC profile**: Verify that `vc-baseline` (which uses `preferPopulousTargets`) produces the same or better results.

### Test blast radius

~32 test files directly import affected modules (policy-agent: 14, policy-eval: 11, prepare-playable-moves: 3, completion-guidance-choice: 4). These may need fixture or construction updates if type signatures change. Golden tests and integration tests are the most likely to require updates.

### Golden tests

8. Update `fitl-policy-summary.golden.json` and `texas-policy-summary.golden.json` to include phase-separated trace fields.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Preview on templates may be less accurate than on completed moves | `coalesce` fallback already handles this; Phase 1 uses the same signal quality as current "without preview" |
| Templates with identical `actionId` but different completions may score differently in Phase 1 | Group by `actionId` and use the best Phase 1 score per group |
| Performance regression from two evaluation passes | Phase 2 only evaluates winning templates — net performance should improve (fewer completions) |

## FOUNDATIONS Alignment

- **Foundation 1 (Engine Agnosticism)**: The two-phase pipeline is game-agnostic — no game-specific logic in the evaluation architecture.
- **Foundation 2 (Evolution-First)**: Evolution campaigns can now independently evolve move-scope and completion-scope considerations without cross-level interference.
- **Foundation 8 (Determinism)**: Both phases are deterministic (same input → same output).
- **Foundation 10 (Bounded Computation)**: Phase 2 reduces computation by completing only winning templates.
- **Foundation 15 (Architectural Completeness)**: Addresses the root cause (entangled decision levels) rather than working around symptoms.
- **Foundation 16 (Testing as Proof)**: The isolation property (completion-scope cannot change action type) is proven by test #1.

## Outcome

- Completed: 2026-04-09
- Changed:
  - The full implementation landed across archived tickets [121TWOPHAPOL-001](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/121TWOPHAPOL-001.md), [121TWOPHAPOL-002](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/121TWOPHAPOL-002.md), [121TWOPHAPOL-003](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/121TWOPHAPOL-003.md), [121TWOPHAPOL-004](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/121TWOPHAPOL-004.md), and [121TWOPHAPOL-005](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/121TWOPHAPOL-005.md).
  - `PolicyAgent.chooseMove` now runs the intended two-phase pipeline: phase 1 scores raw templates to choose `actionId`, phase 2 completes only the winning action type, and diagnostics/traces expose `phase1Score`, `phase2Score`, `phase1ActionRanking`, and per-action completion statistics.
  - The proof surface now includes both synthetic invariants and a production-informed FITL overlay regression that verifies completion guidance does not change selected `actionId` or phase-1 ranking.
- Deviations from original plan:
  - The original backward-compatibility claim ("profiles without completion-scope considerations behave identically") was too strong to prove literally once the single-pass pipeline no longer existed in-repo. The delivered proof work was narrowed to live, mechanically testable invariants instead of reconstructing a historical compatibility harness.
  - The original FITL regression framing relied on mutable production ARVN profile behavior. The implemented regression proof was corrected to use production-derived state plus a test-authored overlay profile so it remains stable under policy evolution.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm turbo typecheck`
  - `pnpm -F @ludoforge/engine test`
  - Focused proof commands across the ticket series, including:
    - `node --test packages/engine/dist/test/unit/prepare-playable-moves.test.js`
    - `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js`
    - `node --test packages/engine/dist/test/unit/agents/policy-diagnostics.test.js`
    - `node --test packages/engine/dist/test/unit/policy-production-golden.test.js`
    - `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
