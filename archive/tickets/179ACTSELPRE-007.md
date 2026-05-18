# 179ACTSELPRE-007: Phase 2b — Classify FITL ARVN post-grant witness activation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None in this ticket; generic contract investigation found the witness targets the wrong live surface.
**Deps**: `archive/tickets/179ACTSELPRE-005.md`

## Problem

Ticket 005 configured `arvn-evolved.preview.outcomeGrantContinuation` and re-added `penalizeOpponentMargin`, but the Phase 2 witness stayed red. `reports/179-phase-2-post-opt-in-witness.md` shows the opt-in block was present and enabled on all 159 main-phase action-selection decisions, yet `previewUsage.outcomeGrantContinuation.exitCounts` remained zero. Opponent-margin refs stayed effectively uniform (`currentMargin.nva` differentiated on 0 / 146 reporting decisions; `currentMargin.vc` on 16 / 146).

This successor originally owned making the FITL ARVN witness actually exercise post-grant opponent-effect paths, then rerunning the Spec 179 Phase 2 gate. The 2026-05-17 reassessment found that the witness is aimed at the wrong contract surface: ordinary FITL operations such as `assault`, `sweep`, and `patrol` are main-phase operation actions, while `outcomeGrantResolve` resolves pending free-operation grants produced by event/free-operation grant flow. The Phase 2 witness therefore cannot prove ordinary operation opponent effects via `previewUsage.outcomeGrantContinuation.exitCounts`.

## Assumption Reassessment (2026-05-17)

1. The red witness is not just WASM masking: TS-only one-seed probes with `--no-wasm`, including `--profile-completion arvn-evolved=agentGuided`, also produced zero post-grant continuation exit counts.
2. The profile opt-in is compiled and traced: ticket 005's report records `withBlock=159`, `enabledBlocks=159`, and `extraDepthReached=0`.
3. A sampled ARVN `assault` candidate completed before `outcomeGrantResolve`, so the next owner must classify whether the current profile/witness path fails to select value-bearing continuations or whether a generic preview-driver seam is incomplete.

## Contract Reassessment (2026-05-17)

1. The saved TS-only one-seed trace contains `actionSelection`, `chooseNStep`, and `chooseOne` decisions, but zero `outcomeGrantResolve` moves.
2. A profile trial that heavily weighted ARVN `assault` made the witness choose `assault` on 4 / 5 main-phase action-selection decisions in the one-seed probe, yet `previewUsage.outcomeGrantContinuation.exitCounts` remained all zero. This rules out simple action-mix starvation as the activation gap.
3. Kernel inspection shows `outcomeGrantResolve` is published from an `OutcomeGrantResolveContext` and applies only when `turnOrderState.runtime.pendingFreeOperationGrants` contains the matching grant. Pending free-operation grants are built by `grantFreeOperation` / event free-operation grant flow, not by ordinary main-phase operation action resolution.
4. FITL `30-rules-actions.md` declares `freeOperationActionIds` so event grants can offer operation actions as free operations, but the ordinary `train`, `patrol`, `sweep`, `assault`, `rally`, `march`, `attack`, and `terror` actions themselves are main-phase operations. Driving normal ARVN operation candidates deeper cannot create an `outcomeGrantResolve` frame unless they are being exercised as a granted free operation.
5. Under `docs/FOUNDATIONS.md`, especially Foundations #1, #5, #10, #15, #16, and #20, the correct outcome is to preserve the red evidence and stop for a user decision. Retargeting the witness to event/free-operation grants or replacing this with a different preview-effect surface is a boundary change beyond this ticket's approved repair.
6. The user approved the reset/discovery path on 2026-05-17; `archive/tickets/179ACTSELPRE-008.md` completed that reset and found no usable production FITL event/free-operation replacement witness. `archive/tickets/179ACTSELPRE-009.md` selected Spec 180's standing-projection successor, with `archive/tickets/180STDVECOBSROL-001.md` owning the first focused failing witness.

## Architecture Check

1. Preserve Foundations #1 and #2: FITL remains the witness workload; do not add game-specific logic to engine/kernel code.
2. Preserve Foundation #10: any repair must keep bounded named cap classes and must not raise `postGrant16` beyond the Spec 179 default unless the user approves a boundary reset.
3. Preserve Foundation #15: fix the root activation gap. Do not close on an opt-in trace block that reports zero continuation activity.
4. Preserve Foundation #20: unavailable, capped, or inactive preview signal must remain explicit in trace output and report prose.

## What to Change

### 1. Classify the activation gap

Use the saved red report and a bounded live probe to determine the first missing seam:

- profile completion does not choose opponent-effect continuations,
- the witness action mix rarely reaches opponent-effect candidates,
- the preview driver completes before free-operation / outcome-grant frames are published,
- or a generic engine bug prevents post-grant continuation from observing the expected frame.

**Result**: classified as witness contract mismatch. The Phase 2 ARVN operation witness does not exercise the event/free-operation `outcomeGrantResolve` contract that Spec 179 extended.

### 2. Repair the smallest owned surface

Do not modify engine code or profile weights under this ticket. The live evidence did not prove a generic engine defect; it proved the witness is stale relative to the live one-rules-protocol contract.

### 3. Rerun the Phase 2 gate

Do not rerun the same 15-seed gate as a closing proof. The current gate cannot satisfy the `outcomeGrantContinuation` activation criteria because the ARVN operation witness does not produce `outcomeGrantResolve` frames.

## Files to Touch

- `reports/179-phase-2-post-opt-in-witness.md` (modify — contract reassessment result)
- `archive/specs/179-action-selection-preview-outcome-grant-opt-in.md` (modify — Phase 2 witness handoff truthing)
- No source/profile edits unless a later user-approved ticket retargets the witness or changes the preview architecture.

## Out of Scope

- WASM-route alignment unless the activation gap is proven to be WASM-specific; `archive/tickets/179ACTSELPRE-006.md` remains the optional WASM owner.
- New `previewEffect.*` or standing-vector surfaces; those are Spec 180+ territory. Ticket 009 selected the integrated Spec 180 standing route rather than a separate `previewEffect.*` namespace.
- Raising the `postGrant16` cap class without user approval.

## Acceptance Criteria

### Blocked Verdict

1. `reports/179-phase-2-post-opt-in-witness.md` preserves the 005 red gate and records the 007 contract reassessment.
2. The ticket stops before changing the witness target, adding FITL-specific engine logic, or lowering the Phase 2 gate.
3. `archive/tickets/179ACTSELPRE-008.md` chose the reset verdict: no usable production event/free-operation `outcomeGrantResolve` replacement witness exists. `archive/tickets/179ACTSELPRE-009.md` selected Spec 180's different ordinary-operation preview surface, starting with `archive/tickets/180STDVECOBSROL-001.md`.

### Invariants

1. No FITL-specific engine branches.
2. Do not claim the current ARVN operation witness proves post-grant activation.
3. Preserve exact red evidence and stop for user decision rather than lowering thresholds.

## Test Plan

### New/Modified Tests

1. No focused engine test was added because no generic engine defect was proven.
2. The decisive evidence is the campaign witness report plus the bounded contract probes recorded there.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --trace-default all --concurrency 1 --no-wasm`
3. Contract probe over `campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json` showing zero `outcomeGrantResolve` moves.
4. `pnpm run check:ticket-deps`

## Outcome (2026-05-18)

Status is complete and archive-ready. This ticket's owned job was classification, and the classification is final: the FITL ARVN Phase 2 operation witness targets ordinary operations and does not exercise the `outcomeGrantResolve` frame that Spec 179 extends.

What landed:

- The red Phase 2 evidence remained preserved in `reports/179-phase-2-post-opt-in-witness.md`.
- The ticket established that the gap is a witness contract mismatch, not a WASM-only bug and not simple action-mix starvation.
- `archive/tickets/179ACTSELPRE-008.md` confirmed there is no usable production FITL event/free-operation replacement witness.
- `archive/tickets/179ACTSELPRE-009.md` selected Spec 180 as the ordinary-operation preview visibility successor.
- Spec 180 completed that successor route through `archive/tickets/180STDVECOBSROL-001.md` through `archive/tickets/180STDVECOBSROL-007.md`.

Verification:

- No additional source change is part of this closeout.
- Archival integrity is covered by `pnpm run check:ticket-deps`.
