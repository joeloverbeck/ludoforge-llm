# 180STDVECOBSROL-007: ARVN standing causal-action and outcome witness

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Profile/report/tooling only unless the witness exposes focused generic trace fallout.
**Deps**: `archive/tickets/180STDVECOBSROL-006.md`

## Problem

Ticket 006 proved that `hurtCurrentLeader` and `reduceNearestThreat` receive differentiated ordinary-operation standing signal, but post-review inspection showed that proof stops at candidate-score differentiation. It does not prove the terms are decisive in selected action choice, and it does not prove the selected actions reduce enemy margins after execution.

The next quality question is profile-facing rather than engine-facing: when ARVN receives role-standing signal, does the profile actually choose actions because of that signal, and do those chosen actions reduce the targeted enemy standing margins?

## Assumption Reassessment (2026-05-18)

1. Ticket 006's acceptance criterion was candidate differentiation on at least 30% of opponent-shift decisions, not selected-action causality or executed enemy-margin reduction.
2. The 15-seed witness produced 16 opponent-standing-shift decisions. Selected actions in that subset were `govern` 14 times and `event` 2 times.
3. A post-review reconstruction over unpruned candidates found `0 / 16` selected-action flips when subtracting the reconstructed standing-term contribution. This is review evidence, not a durable checked-in witness.
4. The current trace records ARVN `marginBefore` / `marginAfter` for top-level action selections, but does not provide a durable report of enemy before/after deltas at the same action boundary.

## Architecture Check

1. This ticket is a profile-quality witness and possible profile retuning task, not a Spec 180 engine substrate task. The standing surface from tickets 001-006 remains valid.
2. FITL ARVN remains the witness workload. No FITL-specific engine code should be added.
3. The proof must distinguish three claims: standing terms differentiated candidate scores, standing terms changed selected actions, and selected actions reduced targeted enemy margins.
4. If the stronger witness is red, the correct repair is bounded profile authoring or report truthing, not weakening Foundation #20 trace semantics or changing generic standing projection.

## What to Change

### 1. Add a causal/action diagnostic

Add or extend a campaign helper that reports, for opponent-standing-shift decisions:

- selected action distribution;
- selected candidate's projected enemy margin cells;
- whether the selected candidate is best or tied-best by projected enemy margin;
- whether removing `hurtCurrentLeader` and `reduceNearestThreat` would change the selected candidate among unpruned candidates;
- which non-standing terms dominate when the selected candidate is not standing-optimal.

### 2. Add an outcome-delta diagnostic

Using trace data or a focused rerun with sufficient trace detail, report enemy before/after margin deltas for selected ARVN main-phase action decisions. If the current trace shape cannot support this without engine changes, record the missing generic trace field precisely and stop before adding game-specific instrumentation.

### 3. Retune only if the witness proves a profile-quality miss

If the causal/action diagnostic shows the standing terms are never decisive, adjust only the bounded ARVN standing considerations or adjacent weights needed to make the role-standing signal operational. Do not retune unrelated ARVN profile behavior.

### 4. Write the follow-up report

Write `reports/180-fitl-arvn-standing-causal-action-witness.md` with exact commands, selected action distribution, counterfactual selection results, enemy-margin outcome deltas, and any residual limits.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/` diagnostic helper (new or modify)
- `reports/180-fitl-arvn-standing-causal-action-witness.md` (new)
- `data/games/fire-in-the-lake/92-agents.md` (modify only if bounded profile retuning is warranted)
- `tickets/180STDVECOBSROL-007.md` (modify outcome)

## Out of Scope

- Reopening the Spec 180 standing projection substrate.
- Claiming Spec 179 `outcomeGrantContinuation` activation.
- Broad ARVN strategy retuning unrelated to `hurtCurrentLeader` / `reduceNearestThreat`.
- Adding FITL-specific engine branches or trace fields.

## Acceptance Criteria

### Tests That Must Pass

1. The causal/action diagnostic reports selected action distribution for every opponent-standing-shift decision in the 15-seed ARVN witness.
2. The diagnostic reports whether removing `hurtCurrentLeader` and `reduceNearestThreat` changes selected candidates among unpruned candidates.
3. The outcome report proves selected-action enemy-margin deltas, or explicitly records the missing generic trace support that blocks that proof.
4. If profile weights are changed, rerun `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8` and `pnpm -F @ludoforge/engine test`.
5. `pnpm run check:ticket-deps`.

### Invariants

1. No FITL-specific engine code.
2. Do not conflate candidate-score differentiation with selected-action causality.
3. Do not conflate projected candidate margin cells with executed after-state enemy-margin deltas.

## Test Plan

### New/Modified Tests

1. No engine unit test is expected unless the review exposes missing generic trace support. This is a profile-quality witness/report ticket.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
2. Causal/action diagnostic command selected by the implementation.
3. `node campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs`
4. `pnpm -F @ludoforge/engine test` if profile or shared trace behavior changes.
5. `pnpm run check:ticket-deps`
