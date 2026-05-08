# 161CHOOSNINNPREV-013: Manual validation: ARVN harness re-run with `chooseNStep: true`

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — campaign + game-data only
**Deps**: `archive/tickets/161CHOOSNINNPREV-004.md`

## Problem

Spec 161 is motivated by ARVN's seed-1000 evidence: 11 chooseNStep decisions, 5/11 tied, broken by stable-key alphabetical ordering rather than by per-option preview signal. After Tickets 001–006 land the runtime integration, a manual harness re-run validates the campaign-level claim — that opting `arvn-evolved` into `preview.inner.chooseNStep: true` flips `previewUsage.mode` from `disabled` to `exactWorld` at chooseNStep microturns and breaks ties via projected-margin deltas, mirroring the chooseOne result captured in commit `3695b1731`.

This ticket updates the ARVN profile, re-runs the harness, and captures the trace evidence in the campaign log.

## Assumption Reassessment (2026-05-07)

1. The ARVN policy profile lives in `data/games/fire-in-the-lake/92-agents.md` (verified via `git show 3695b1731 --stat`).
2. The ARVN profile already opts into `preview.inner.chooseOne: true` and includes the `preferOptionProjectedMargin` microturn-scope consideration (commit `3695b1731`).
3. `campaigns/fitl-arvn-agent-evolution/harness.sh` runs the canonical campaign harness; outputs land in `run.log.tournament-full`, `last-trace.json`, `results.tsv`, and `traces/` per the existing campaign layout.
4. After Ticket 006, the ARVN profile's `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))` must fit under 256. With current values `8 × 1 × 4` = squared 200, this passes.

## Architecture Check

1. F#2 — Evolution-First: the change is YAML-only — `preview.inner.chooseNStep: true` is added to the ARVN profile's `preview.inner` block.
2. F#1 — engine-agnostic: no game-specific code change. The campaign-level update touches only data, not engine source.
3. The trace evidence captured here is informational — not a regression test (those live in Tickets 007–011). The campaign-level capture documents real-world impact for the campaign log.

## What to Change

### 1. Opt-in change — `data/games/fire-in-the-lake/92-agents.md`

Add `chooseNStep: true` to the `preview.inner` block of the `arvn-evolved` profile (alongside the existing `chooseOne: true`). Verify the profile compiles cleanly under the squared-cost formula (Ticket 006 already validates).

### 2. Harness re-run

Run `bash campaigns/fitl-arvn-agent-evolution/harness.sh` against the updated profile. Capture:

- `run.log.tournament-full` (or analogous) showing `previewUsage.mode: exactWorld` at chooseNStep microturns.
- Number of chooseNStep ties broken via projected-margin delta vs. baseline (5/11 was the pre-change observation).
- Updated `results.tsv` row(s) reflecting the new run.

### 3. Campaign log update

Append a note to `campaigns/fitl-arvn-agent-evolution/lessons.jsonl` (or the campaign's canonical log file) summarizing:

- Date and commit hash of the harness re-run.
- Profile change diff (chooseNStep flag added).
- Quantitative impact on tied chooseNStep decisions and avgMargin.
- Reference to Spec 161 and to the `commit 3695b1731` precedent.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add `chooseNStep: true` to `arvn-evolved` profile's `preview.inner` block)
- `campaigns/fitl-arvn-agent-evolution/lessons.jsonl` (modify — append harness re-run summary)
- `campaigns/fitl-arvn-agent-evolution/results.tsv` (modify — new row(s) from re-run)
- `campaigns/fitl-arvn-agent-evolution/run.log.tournament-full` and analogous run-log files (modify — replaced by re-run output)

## Out of Scope

- Engine source changes — none.
- Other campaigns or profiles (e.g., VC) — out of scope; this ticket is ARVN-specific.
- Cookbook updates — Ticket 012.
- Adding the chooseNStep flag as part of an automated regression — the regression coverage is delivered by Tickets 007–011; this ticket is the campaign-level confirmation step.

## Acceptance Criteria

### Tests That Must Pass

1. Profile compiles cleanly under the squared-cost formula (verified by `pnpm turbo build` after the YAML edit).
2. `pnpm -F @ludoforge/engine test` passes (regression coverage from Tickets 007–011 holds against the updated profile).
3. Manual: harness re-run produces `previewUsage.mode: exactWorld` at every chooseNStep microturn for `arvn-evolved`.
4. Manual: tied chooseNStep decisions are broken by projected-margin delta on at least one observed seed (target: at least 1/5 ties broken; quantify in the campaign log).

### Invariants

1. The ARVN profile YAML opt-in is the only change required — no engine code edits piggybacked into this ticket.

## Test Plan

### New/Modified Tests

None — campaign-level manual validation. Regression coverage is provided by Tickets 007–011.

### Commands

1. `pnpm turbo build` (verifies the profile compiles cleanly under the squared-cost formula).
2. `bash campaigns/fitl-arvn-agent-evolution/harness.sh`.
3. Inspect `campaigns/fitl-arvn-agent-evolution/run.log.tournament-full` — confirm `previewUsage.mode: exactWorld` at chooseNStep microturns.
4. Inspect `last-trace.json` for `frontierDecisionKey` ordering and tied-decision resolution evidence.
5. `pnpm -F @ludoforge/engine test` (regression check).
