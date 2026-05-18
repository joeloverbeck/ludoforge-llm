# 180STDVECOBSROL-007: ARVN standing causal-action and outcome witness

**Status**: COMPLETED
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

## Outcome (2026-05-18)

Status is complete. The owned implementation, profile retune, durable report, profile-golden fallout refresh, and final proof lanes are in place.

What landed:

- `campaigns/fitl-arvn-agent-evolution/diagnose-standing-causal-action.mjs` adds the durable causal/action diagnostic. It reads the 15-seed trace set, subtracts reconstructed `hurtCurrentLeader` and `reduceNearestThreat` contributions from unpruned candidates, reports counterfactual selected-action flips, reports projected opponent-margin optimality, and reruns the value-bearing seed subset through the generic simulator step seam to measure after-action opponent-margin deltas.
- `campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs` now reconstructs the role-standing contribution using the retained profile weight of `600`.
- `data/games/fire-in-the-lake/92-agents.md` retunes only `hurtCurrentLeader` and `reduceNearestThreat`, from `200` to `600`, after the pre-retune causal diagnostic found `0 / 16` selected-action flips.
- `reports/180-fitl-arvn-standing-causal-action-witness.md` is the durable report. Raw traces remain ignored runtime artifacts and are transcribed into the report instead of checked in.

Witness result:

- Pre-retune causal diagnostic: `16` opponent-standing-shift decisions; selected actions `govern=14`, `event=2`; `0 / 16` counterfactual selected-action flips; targeted margin deltas were all unchanged when measured at the too-early immediate action-selection boundary.
- Intermediate `1200`-weight probe: `7 / 20` counterfactual selected-action flips, but the 15-seed tournament summary worsened to `compositeScore=-7.8667`, `avgMargin=-8.5333`, `wins=1/15`.
- Retained `600`-weight run: `completed=15`, `truncated=0`, `errors=0`, `compositeScore=-7.2`, `avgMargin=-7.8667`, `wins=1/15`, `wasmEnabled=true`.
- Standing aggregation on retained traces: `mainPhaseActionSelectionDecisions=150`, `decisionsWithSeatMatrix=150`, `decisionsWithOpponentStandingShift=20`, `hurtCurrentLeader=20/20`, `reduceNearestThreat=20/20`.
- Causal/action diagnostic on retained traces: `counterfactualSelectionFlips=5/20`, selected action distribution `govern=12`, `event=4`, `sweep=4`, selected candidate best/tied-best by projected opponent margin `15/20`, selected candidate not best `1/20`.
- Outcome deltas on retained traces: `3 / 16` targeted opponent-seat rows improved, `13 / 16` unchanged, `0 / 16` worsened.

Boundary corrections and residual limits:

- The original immediate `marginAfter` shape was too early for FITL operations/events because top-level action selection can be followed by microturns. The new diagnostic records outcome deltas after the selected action's microturn sequence completes, before the next action-selection begins.
- The retained retune proves selected-action causality for a subset of opponent-shift decisions, but it does not prove an aggregate profile-quality improvement. The tournament summary is worse than the ticket-006 witness.
- Some standing-driven selected actions have no ready targeted opponent cell on the selected candidate; those rows count for selected-action causality but are excluded from the targeted-margin delta denominator.
- No engine code or Spec 180 standing substrate changed.

Command ledger:

| Ticket section | Literal command/shorthand | Status | Final citation |
| --- | --- | --- | --- |
| Test Plan | `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8` | run directly | witness report |
| Test Plan | Causal/action diagnostic command selected by the implementation | selected and run as `node campaigns/fitl-arvn-agent-evolution/diagnose-standing-causal-action.mjs` | witness report |
| Test Plan | `node campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs` | run directly | witness report |
| Test Plan | `pnpm -F @ludoforge/engine test` if profile or shared trace behavior changes | passed | profile changed |
| Test Plan | `pnpm run check:ticket-deps` | passed | status/dependency integrity |

Profile-golden fallout:

- The first engine package test after the profile retune failed only in `packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js`, as expected for authored-profile golden fallout.
- The five Spec 178 ARVN continued-deepening parity fixtures were regenerated from the test's own capture logic: `178-outcome-parity-1005.json`, `178-outcome-parity-1011.json`, `178-outcome-parity-1008.json`, `178-outcome-parity-1013.json`, and `178-outcome-parity-1009.json`. `178-outcome-parity-1011.json` ended byte-identical to HEAD.
- Focused parity proof passed with `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-preview-inner-outcome-parity.test.js`: `5` tests passed.
- Final package proof passed with `pnpm -F @ludoforge/engine test`: schema artifacts check passed and `92 / 92` test files passed.
- Dependency proof passed with `pnpm run check:ticket-deps`: dependency integrity passed for `4` active tickets and `2407` archived tickets.

Generated/artifact fallout:

- `reports/180-fitl-arvn-standing-causal-action-witness.md` is checked in.
- `campaigns/fitl-arvn-agent-evolution/traces/`, `.gamedef-cache/`, and other campaign runtime files remain ignored.
- No schema artifact changes are expected because this ticket changes authored profile/tooling/report only.

Source-size decision:

- New helper `campaigns/fitl-arvn-agent-evolution/diagnose-standing-causal-action.mjs` is 457 lines, under the 800-line cap and below the 600-line source-size sweep trigger.
- Existing helper `campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs` changed one constant only.
- Touched data/report/ticket files are not source-size gated. No TypeScript source file grew.
