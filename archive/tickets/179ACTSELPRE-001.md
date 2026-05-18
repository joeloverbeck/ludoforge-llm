# 179ACTSELPRE-001: Phase 0 — Pre-implementation bench (baseline witness report)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — measurement-only on current `arvn-evolved` substrate; no source modifications.
**Deps**: `archive/specs/179-action-selection-preview-outcome-grant-opt-in.md`

## Problem

Spec 179's acceptance gate (Phase 2, §6) requires comparing post-implementation slow-tier wall-time and opponent-margin signal differentiation against a *pre-implementation baseline*. Without a checked-in baseline, the Phase 2 comparison has no anchor and the perf gate (≤ 5% slow-tier regression) cannot be evaluated. The trigger report (`reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`) recorded a one-time measurement, but Phase 0 must re-confirm uniformity on a clean check-out and capture wall-time numbers so Phase 2 can prove its delta is within budget.

The spec's §10 ticket-decomposition guidance authored during brainstorm omitted Phase 0 (it jumped to Phase 1 work as ticket 001). This ticket corrects that gap per ticket-fidelity and aligns ticket numbering with the phase structure in §5.

## Assumption Reassessment (2026-05-17)

1. `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` and `diagnose-action-distribution.mjs` exist and match the witness invocation pattern in spec §9 — verified during brainstorm; the trigger report (`reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`) used these exact commands at tier-15.
2. The `arvn-evolved` profile at `data/games/fire-in-the-lake/92-agents.md` defines the current opt-out substrate (Spec 178 post-fix `deep1024 / depthCap:16 / maxOptions:8 / fullCandidateCap:10`). Verified via prior session's Explore agent against `92-agents.md`.
3. The `penalizeOpponentMargin` consideration is NOT currently in `arvn-evolved` — it was removed after exp-002 confirmed dead-weight at action scope (per `campaigns/fitl-arvn-agent-evolution/lessons.jsonl` line 39). Phase 0 must re-add it as a temporary measurement-only consideration, capture baseline, then revert before Phase 1 schema work begins.

## Architecture Check

1. **Measurement-only — no behavioral change.** Phase 0 produces a baseline report; no engine code, no profile changes that ship. Foundation 10 (Bounded Computation) unaffected. The temporary `penalizeOpponentMargin` re-addition lives in a separate measurement branch or commit and is reverted at the end of this ticket; it does not land on main.
2. **Baseline numbers are durable evidence**, not session-ephemeral. The report file is checked into `reports/` so Phase 2's `/implement-ticket` session has the comparison anchor regardless of which operator runs it. This mirrors Spec 162's witness-fixture promotion pattern (`packages/engine/test/fixtures/`).
3. **No agnostic-boundary impact.** Witness lives entirely in `campaigns/fitl-arvn-agent-evolution/` and a custom aggregation script under the same directory. Engine/kernel untouched.

## What to Change

### 1. Run the baseline witness

Re-add `penalizeOpponentMargin` to `data/games/fire-in-the-lake/92-agents.md` (`arvn-evolved` profile) in a local working state — match the exp-002 formulation from the trigger report:

```yaml
candidateFeatures:
  projectedNvaMargin:
    expr: { coalesce: [{ ref: preview.victory.currentMargin.nva }, { ref: feature.nvaMargin }] }
  projectedVcMargin:
    expr: { coalesce: [{ ref: preview.victory.currentMargin.vc }, { ref: feature.vcMargin }] }

considerations:
  penalizeOpponentMargin:
    scopes: [move]
    weight: -200
    value: { add: [{ ref: feature.projectedNvaMargin }, { ref: feature.projectedVcMargin }] }
```

Plus the supporting `stateFeatures.nvaMargin` / `vcMargin` (the `victory.currentMargin.<seat>` wrappers — see trigger report §"Empirical evidence").

### 2. Capture wall-time + ready-ref stats

Run the witness command per spec §9:

```bash
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs \
  --seeds 15 --trace-default all --concurrency 8
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs
```

Capture:
- Slow-tier wall-clock time (seconds, from the run-tournament invocation)
- Action distribution (Govern/Train/Event/Transport/Patrol/Sweep/Assault percentages)
- `previewUsage.readyRefStats` aggregated across 159 main-phase decisions × 15 seeds, formatted as the per-ref table in the trigger report

The aggregation script lives at `campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` (new) — port the trigger-report aggregation logic into a checked-in script so Phase 2 can re-run identical methodology. Script reads `campaigns/fitl-arvn-agent-evolution/traces/trace-*.json` and prints the per-ref table.

### 3. Write the baseline report

Author `reports/179-phase-0-pre-opt-in-baseline.md` with:
- Date, repo HEAD SHA, profile version (commit SHA on `92-agents.md`)
- Wall-time number with run conditions (concurrency, seed count)
- Action distribution table
- Per-ref readyRefStats table (mirroring the trigger report's format)
- Uniformity confirmation sentence: "Confirmed: opponent margin refs uniform across candidates at this substrate state."

### 4. Revert the measurement profile change

After capturing the report, revert the `penalizeOpponentMargin` + supporting features from `92-agents.md`. The profile must return to its current-on-main state. Verify with `git diff data/games/fire-in-the-lake/92-agents.md` — should show empty.

## Files to Touch

- `reports/179-phase-0-pre-opt-in-baseline.md` (new)
- `campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` (new — checked-in aggregation script for reproducibility)
- `data/games/fire-in-the-lake/92-agents.md` (modify *then* revert — net diff zero in commit; measurement-only edit during the bench run)

## Out of Scope

- Schema, compiler, validator, or driver changes (Phase 1 work — ticket 002+).
- Permanent profile changes — `penalizeOpponentMargin` re-addition is measurement-only; final state of `92-agents.md` matches pre-ticket main.
- Tightening the perf gate beyond ≤ 5% slow-tier regression — the gate is owned by ticket 005's Phase 2 acceptance comparison.

## Outcome

Outcome amended: 2026-05-18

Completed: 2026-05-17

Phase 0 baseline evidence was captured and transcribed into `reports/179-phase-0-pre-opt-in-baseline.md`.

What landed:

- Added `campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs`, a deterministic aggregation script over `campaigns/fitl-arvn-agent-evolution/traces/trace-*.json`.
- Wrote `reports/179-phase-0-pre-opt-in-baseline.md` with the exact baseline command, repo/profile identity, wall time, action distribution, ready-ref stats table, and uniformity confirmation.
- Temporarily re-added the ticket's `penalizeOpponentMargin` measurement overlay to `data/games/fire-in-the-lake/92-agents.md` for the tournament run, then reverted it. The final repository diff for `92-agents.md` is intentionally empty.

Measured baseline:

- Command: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
- Wall time: `53.16s`
- Result: `compositeScore=-3.2`, `avgMargin=-5.2`, `winRate=0.2`, `completed=15`, `truncated=0`, `errors=0`
- Action distribution, main-phase action-selection: Govern `119/159 (74.8%)`, Train `23/159 (14.5%)`, Event `10/159 (6.3%)`, Transport `6/159 (3.8%)`, Resolve Honolulu Pacify `1/159 (0.6%)`, Patrol/Sweep/Assault `0`.
- Ready-ref stats, main-phase action-selection: `victoryCurrentMargin.currentMargin.nva` was uniform in `146/146` reporting decisions, avg range `0.00`; `victoryCurrentMargin.currentMargin.vc` was uniform in `130/146` reporting decisions, avg range `0.32`; self-margin control differentiated in `46/146` reporting decisions, avg range `0.81`.

Evidence delivery:

- Raw traces are ignored ephemeral evidence under `campaigns/fitl-arvn-agent-evolution/traces/`; the checked-in durable evidence is the report plus reusable aggregation script.
- The ready-ref stats script intentionally aggregates the ticket-owned Phase 0 boundary: main-phase `actionSelection` decisions for the evolved seat, excluding coup forced decisions and microturn choices. This differs from the earlier trigger report's broader all-actionSelection table and matches this ticket's 159-decision baseline requirement.

Generated/schema fallout: none. This ticket does not change engine, compiler, validator, schema, GameDef, or profile source in the final diff.

Final proof plan before terminal status:

- `node --check campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs`
- `node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` twice against the captured trace set with byte-identical output
- `git diff data/games/fire-in-the-lake/92-agents.md` empty
- `pnpm turbo test`
- `pnpm run check:ticket-deps` after terminal status/proof transcription

Final verification:

- `node --check campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` — passed.
- `node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` twice against the captured trace set plus `diff` — passed with byte-identical output.
- `git diff data/games/fire-in-the-lake/92-agents.md` — passed with empty output.
- `git diff --no-index --check /dev/null campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` — whitespace-clean; command exits nonzero for ordinary no-index content differences with empty diagnostic output.
- `git diff --no-index --check /dev/null reports/179-phase-0-pre-opt-in-baseline.md` — whitespace-clean; command exits nonzero for ordinary no-index content differences with empty diagnostic output.
- `pnpm turbo test` — passed: 5/5 tasks successful, 1 cached build task, total time `3m25.133s`. Runner/jsdom canvas and ticker-error stderr were non-ticket-owned advisory emissions from existing tests; no failures.
- `pnpm run check:ticket-deps` — passed for 6 active tickets and 2395 archived tickets.

Late-edit proof validity: terminal status/proof transcription only; no source, schema, profile, command semantics, touched-file ownership, follow-up ownership, or acceptance boundary changed after `pnpm turbo test`.

## Acceptance Criteria

### Tests That Must Pass

1. `reports/179-phase-0-pre-opt-in-baseline.md` exists with the four required content blocks (header metadata, wall-time, action distribution, readyRefStats table).
2. `campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` runs against the captured traces and reproduces the readyRefStats table from the report exactly.
3. `git diff data/games/fire-in-the-lake/92-agents.md` is empty at ticket close.
4. Existing engine suite green: `pnpm turbo test`.

### Invariants

1. Baseline report is reproducible from the script — the same trace set processed twice through `diagnose-ready-ref-stats.mjs` produces byte-identical output (Foundation 8 — Determinism applied to the diagnostic tool, not just the engine).
2. The aggregation script promoted under `campaigns/fitl-arvn-agent-evolution/` is reusable by Phase 2 (ticket 005) without modification.

## Test Plan

### New/Modified Tests

1. `reports/179-phase-0-pre-opt-in-baseline.md` — measurement output, not a programmatic test, but its existence and content are validated by ticket 005's Phase 2 comparison.
2. `campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` — manually verified by running twice on the same trace set and diffing output (`diff <(node diagnose-ready-ref-stats.mjs) <(node diagnose-ready-ref-stats.mjs)` — empty diff required).

### Commands

1. Baseline run: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
2. Action distribution: `node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs`
3. ReadyRefStats aggregation: `node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs`
4. Determinism check: `diff <(node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs) <(node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs)` — must be empty
5. Profile revert verification: `git diff data/games/fire-in-the-lake/92-agents.md` — must be empty at ticket close
6. Full suite: `pnpm turbo test`
