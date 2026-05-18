# 180STDVECOBSROL-006: Phase 5 - FITL ARVN standing witness and cookbook addendum

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Profile/docs/report only unless integration proof exposes focused fallout.
**Deps**: `archive/tickets/180STDVECOBSROL-002.md`, `archive/tickets/180STDVECOBSROL-003.md`, `archive/tickets/180STDVECOBSROL-004.md`, `archive/tickets/180STDVECOBSROL-005.md`

## Problem

After Spec 180 lands standing projection, status-aware aggregates, seat matrix trace metadata, and role primitives, the series needs the FITL ARVN integration witness that Spec 179 could not close. This ticket proves ordinary-operation opponent-standing visibility with role-based considerations and updates author-facing documentation.

## Assumption Reassessment (2026-05-17)

1. The old Spec 179 Phase 2 gate is not reused because it depends on `previewUsage.outcomeGrantContinuation.exitCounts`.
2. The new witness uses ordinary-operation standing cells and role selectors, not production `outcomeGrantResolve` activation.
3. The existing red report and Phase 0 baseline remain historical context, not acceptance thresholds for this new surface.

## Architecture Check

1. FITL is only the witness workload; the implemented surface must be generic.
2. Witness metrics must distinguish ready, unavailable, capped, and partial signal.
3. Cookbook prose must describe landed behavior and explicit fallbacks, not aspirational profile tuning.

## What to Change

### 1. Add role-based ARVN considerations

Add bounded `hurtCurrentLeader` and `reduceNearestThreat` considerations to `arvn-evolved` using the Spec 180 standing surface with explicit `previewFallback: noContribution`.

### 2. Run the FITL witness

Run the bounded ARVN campaign and aggregate `previewUsage.seatMatrix` / ready-ref stats for ordinary-operation candidates.

### 3. Update reports and docs

Update the cookbook with standing projection, `seatAgg.availability`, role primitives, and `seatMatrix`. Write or update a report with exact commands, seed range, standing differentiation metrics, and residual risks.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `docs/agent-dsl-cookbook.md` (modify)
- `reports/180-fitl-arvn-standing-witness.md` (new)
- campaign diagnostic helper script if needed for reusable matrix aggregation

## Out of Scope

- Retuning unrelated ARVN profile weights.
- Migrating VC or other profiles.
- Inner-preview opponent option refs.
- Claiming Spec 179 `outcomeGrantContinuation` activation from ordinary-operation evidence.

## Acceptance Criteria

### Tests That Must Pass

1. `hurtCurrentLeader` and `reduceNearestThreat` differentiate ARVN ordinary-operation candidates on at least 30% of main-phase decisions where opponent margins shift through the standing projection.
2. `previewUsage.seatMatrix` records per-candidate x per-seat ready/unavailable status for the witness refs.
3. Cookbook addendum lands with exact field names and fallback guidance.
4. `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific engine code.
2. Unavailable or capped standing signal uses explicit fallback and trace provenance.
3. Reported witness metrics do not reuse the old `outcomeGrantContinuation.exitCounts` gate.

## Test Plan

### New/Modified Tests

1. No new unit test expected unless integration proof exposes missing focused fallout. The durable proof is the campaign report plus existing Spec 180 architecture tests.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
2. `node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs`
3. Matrix/standing aggregation command selected by the implementing ticket.
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome (2026-05-18)

Outcome amended: 2026-05-18

Status is complete. The final package proof completed after the profile/docs/report updates and the owned Spec 178 fixture fallout refresh.

What landed:

- `data/games/fire-in-the-lake/92-agents.md` adds `hurtCurrentLeader` and `reduceNearestThreat` to `arvn-evolved`. Both use `preview.victory.currentMargin.$seat` through role-based `seatAgg`, `availability: selfAndTargetReady`, and `previewFallback.onUnavailable: noContribution`.
- `campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs` is the selected reusable matrix/standing aggregation command.
- `docs/agent-dsl-cookbook.md` documents `previewUsage.seatMatrix`, `seatAgg.availability`, explicit preview fallback posture, and standing role examples.
- `docs/FOUNDATIONS.md` Appendix now credits Spec 180 with extending Foundation 20 to outer-preview seat aggregates, role refs, and seat-matrix evidence.
- `reports/180-fitl-arvn-standing-witness.md` is the durable witness report. Raw traces/results remain ignored runtime artifacts and are transcribed into the report instead of checked in.
- Existing Spec 178 outcome-parity fixtures for `arvn-evolved` were regenerated because the intentional ARVN profile change shifts those profile-golden trajectories.

Post-review clarification:

- This ticket proves the accepted Phase 5 claim: candidate-score differentiation for the two role-standing terms when opponent standing shifts through the projection.
- It does not prove that the terms are decisive in selected action choice, and it does not prove executed selected actions reduce enemy margins after the action boundary.
- Follow-up `archive/tickets/180STDVECOBSROL-007.md` completed the stronger causal-action and outcome-delta witness.

Witness result:

- Command: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
- Result: `completed=15`, `truncated=0`, `errors=0`, `compositeScore=-2.8`, `avgMargin=-4.8`, `winRate=0.2`, `wasmEnabled=true`.
- Standing aggregation: `mainPhaseActionSelectionDecisions=150`, `decisionsWithSeatMatrix=150`, `decisionsWithOpponentStandingShift=16`, `hurtCurrentLeader=16/16`, `reduceNearestThreat=16/16`.

Command ledger:

| Ticket section | Literal command/shorthand | Status | Final citation |
| --- | --- | --- | --- |
| Test Plan | `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8` | run directly | witness report |
| Test Plan | `node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs` | run directly | witness report |
| Test Plan | Matrix/standing aggregation command selected by the implementing ticket | selected and run as `node campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs` | witness report |
| Broad engine lane fallout | `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts` | existing profile-golden expectations refreshed after the broad lane exposed intentional ARVN trajectory drift | `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-preview-inner-outcome-parity.test.js` passed, 5 tests |
| Test Plan | `pnpm -F @ludoforge/engine test` | passed | unit tests passed; dist runner summary `92/92 files passed` |
| Test Plan | `pnpm run check:ticket-deps` | passed | `Ticket dependency integrity check passed for 4 active tickets and 2406 archived tickets.` |

Generated/artifact fallout:

- `reports/180-fitl-arvn-standing-witness.md` is checked in.
- `packages/engine/test/architecture/fixtures/178-outcome-parity-{1005,1008,1009,1011,1013}.json` are regenerated profile-golden fallout for the changed `arvn-evolved` policy.
- `campaigns/fitl-arvn-agent-evolution/traces/`, `.gamedef-cache/`, and other campaign runtime files remain ignored.
- No schema artifact changes are expected because this ticket changes authored profile/docs/report only.

Source-size decision:

- New helper `campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs` is 206 lines, under repo guidance.
- Touched data/docs files are not source-size gated. No TypeScript source file grew.

Late-edit proof:

- The campaign/report proof and focused fixture fallout proof ran before this outcome transcription.
- `pnpm -F @ludoforge/engine test` was rerun after the fixture refresh and passed.
- `pnpm run check:ticket-deps` passed after the status update.
- The final ticket edit after dependency proof only transcribed that checker result and did not change ticket dependencies, scope, or acceptance criteria.
