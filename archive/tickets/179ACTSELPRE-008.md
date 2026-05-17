# 179ACTSELPRE-008: Phase 2c — Reset Spec 179 witness contract

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Unknown — discovery first; no engine changes unless a generic `outcomeGrantResolve` defect is proven with TDD.
**Deps**: `tickets/179ACTSELPRE-007.md`

## Problem

Spec 179 implemented an opt-in preview continuation through `outcomeGrantResolve`, but the original Phase 2 FITL ARVN witness targeted ordinary `patrol`, `sweep`, and `assault` operation candidates. Ticket 007 classified that witness as the wrong contract surface: ordinary operations do not publish `outcomeGrantResolve`; that frame resolves pending event/free-operation grants.

This ticket owns the user-approved boundary reset. It must determine whether Spec 179 can still close with a FITL event/free-operation grant witness, or whether Spec 179 should remain blocked/deferred while a separate ordinary-operation preview surface is specified.

## Assumption Reassessment (2026-05-17)

1. Ticket 005 landed the profile opt-in, cookbook documentation, and red Phase 2 report, but did not pass the signal or continuation-activation gates.
2. Ticket 007 proved the red gate is not a simple profile-weight, WASM-route, or generic engine defect; the original operation witness does not exercise the `outcomeGrantResolve` contract.
3. FITL event files contain `freeOperationGrants` / `grantFreeOperation` definitions, so a replacement witness may exist, but that must be proven from live traces before changing acceptance wording.

## Architecture Check

1. Preserve Foundations #1 and #5: any replacement witness must use the generic one-rules-protocol path; do not add FITL-specific engine branches.
2. Preserve Foundation #10: keep `outcomeGrantContinuation.extraDepthCap` and `capClass` bounded and named; do not tune cap classes in this reset ticket unless the witness proves the existing `postGrant16` budget is the only blocker.
3. Preserve Foundations #15 and #20: do not claim ordinary operation opponent effects are proven by an event/free-operation grant witness. If the desired behavior is ordinary-operation visibility, open or update a separate preview-effect spec/ticket instead.

## What to Change

### 1. Discover whether a valid replacement witness exists

Search current FITL event/free-operation grant paths and run bounded probes to find an action-selection candidate path that actually reaches `outcomeGrantResolve` with `arvn-evolved.preview.outcomeGrantContinuation.enabled=true`.

The discovery must classify:

- no usable FITL event/free-operation grant witness found,
- usable witness found but does not affect the relevant opponent-margin refs,
- usable witness found and exercises non-zero `previewUsage.outcomeGrantContinuation.exitCounts`,
- or a generic engine defect prevents an otherwise valid grant path from continuing.

### 2. Reset or defer the Phase 2 acceptance gate

If a valid witness exists, update `specs/179-action-selection-preview-outcome-grant-opt-in.md`, `reports/179-phase-2-post-opt-in-witness.md`, and active tickets so Phase 2 targets the event/free-operation grant contract truthfully.

If no valid witness exists, keep Spec 179 blocked/deferred and create or update the next owner for ordinary-operation preview visibility without weakening the `outcomeGrantResolve` acceptance claim.

### 3. Run the appropriate proof

For a valid replacement witness, run a bounded Phase 2 replacement gate and record:

- trace-visible non-zero `previewUsage.outcomeGrantContinuation.exitCounts`,
- candidate/ref stats for the refs the witness actually exercises,
- wall-time delta versus the Phase 0 baseline when comparable,
- and explicit limits if the replacement witness no longer supports the old `currentMargin.nva` / `currentMargin.vc` threshold shape.

## Files to Touch

- `specs/179-action-selection-preview-outcome-grant-opt-in.md` (modify — reset Phase 2 witness contract or defer Spec 179 truthfully)
- `reports/179-phase-2-post-opt-in-witness.md` (modify — append replacement witness or deferral evidence)
- `tickets/179ACTSELPRE-005.md` (modify — residual owner/path cleanup if Phase 2 resets)
- `tickets/179ACTSELPRE-007.md` (modify — handoff cleanup if Phase 2 resets)
- `tickets/179ACTSELPRE-006.md` (modify only if replacement witness data changes WASM-route ownership)
- `data/games/fire-in-the-lake/92-agents.md` and campaign diagnostics (modify only if the replacement witness requires profile/campaign routing)
- `packages/engine/src/**` and `packages/engine/test/**` (modify only if TDD proves a generic engine defect)

## Out of Scope

- FITL-specific engine branches.
- Retuning ordinary operation action selection as if it proved `outcomeGrantResolve`.
- Implementing a new `previewEffect.*` or standing-vector surface directly in this ticket; create or update a separate spec/ticket if discovery chooses that path.
- WASM-route alignment, except for recording replacement witness route data needed by `tickets/179ACTSELPRE-006.md`.

## Acceptance Criteria

### Tests That Must Pass

1. Discovery result is recorded in `reports/179-phase-2-post-opt-in-witness.md` with the exact probe commands and decisive trace counts.
2. If a replacement witness exists, it records non-zero `previewUsage.outcomeGrantContinuation.exitCounts` and a truthfully scoped ref/metric gate.
3. If no replacement witness exists, Spec 179 and same-family active tickets explicitly state the deferral/next-owner path.
4. `pnpm run check:ticket-deps`.

### Invariants

1. Do not archive tickets 005 or 007 unless the reset makes their outcomes terminal under `docs/archival-workflow.md`.
2. Do not lower the old ARVN operation witness thresholds and call them passed.
3. Do not add engine code without first adding a focused failing test for a generic `outcomeGrantResolve` behavior defect.

## Test Plan

### New/Modified Tests

1. Add or modify focused engine tests only if discovery proves a generic engine defect.
2. Otherwise, the proof is a bounded campaign/trace witness recorded in the report.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Bounded FITL event/free-operation grant probe command(s) discovered during implementation.
3. Replacement witness/report aggregation command(s), if a valid witness exists.
4. `pnpm run check:ticket-deps`

## Outcome (2026-05-17)

Outcome amended: 2026-05-17

Completed reset verdict; Spec 179 remains blocked/deferred. No usable production FITL event/free-operation replacement witness was found.

Discovery result:

- Source inventory found many FITL `freeOperationGrants` / `grantFreeOperation` declarations, including production card-46 shaded (`559th Transport Grp`) issuing a required free-operation grant.
- `pnpm -F @ludoforge/engine build` passed before the bounded probes.
- `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --trace-default all --concurrency 1 --no-wasm` produced 20 evolved-player `actionSelection` decisions, 12 `chooseNStep` decisions, 25 `chooseOne` decisions, zero `outcomeGrantResolve` decisions, and zero `previewUsage.outcomeGrantContinuation.exitCounts`.
- A production card-46 shaded event/free-operation probe published an event candidate and verified that applying it issued a pending free-operation grant (`seat=nva`, `actionIds=["infiltrate"]`, `phase=ready`, `remainingUses=1`), but the event candidate's preview drive still completed at depth 1 with `previewUsage.outcomeGrantContinuation.exitCounts={completed:0,postGrantCap:0,stochastic:0}`.
- A source sweep found no production builder for `OutcomeGrantResolveContext`; the only concrete constructed `outcomeGrantResolve` frame in the repo is the synthetic architecture fixture at `packages/engine/test/architecture/preview-post-grant/post-grant-fixture.ts`.

Classification:

- Discovery class: `no usable FITL event/free-operation grant witness found`.
- Engine source/test edits: none. The evidence proves a contract mismatch between Spec 179's frame target and current production FITL grant routing, not a generic `outcomeGrantResolve` behavior defect requiring TDD.
- Spec 179 status: still blocked/deferred, now by `tickets/179ACTSELPRE-009.md`.
- Same-family ticket updates: 005 and 007 remain blocked/not archive-ready; 006 is blocked until the successor surface defines whether `outcomeGrantContinuation` or another preview route still needs WASM alignment.
- Successor: `tickets/179ACTSELPRE-009.md` owns specifying the ordinary-operation preview visibility surface without weakening the old Spec 179 gate.

Command ledger:

| ticket section | literal command/shorthand | ran directly/subsumed/split/replaced/not run | final citation |
| --- | --- | --- | --- |
| Test Plan | `pnpm -F @ludoforge/engine build` | run directly | passed before probes |
| Test Plan | bounded FITL event/free-operation grant probe command(s) | split into one-seed TS tournament probe plus production card-46 shaded in-memory probe | report 008 reset verdict |
| Test Plan | replacement witness/report aggregation command(s), if valid witness exists | not run; no valid replacement witness exists | report 008 reset verdict |
| Acceptance | `pnpm run check:ticket-deps` | run directly after graph edits | passed: 5 active tickets and 2399 archived tickets |

Generated/schema fallout: none. This ticket changed spec/report/ticket graph artifacts only; no engine source, schema artifacts, generated GameDef, profile YAML, or campaign diagnostics were modified.

Proof validity: final proof is graph/report integrity plus bounded probe transcription. The source-level engine build preceded the probes and no source files changed afterward. No-invalidation: terminal status/proof transcription and post-check dependency result transcription only; no source, schema, command semantics, acceptance threshold, or successor ownership changed after `pnpm run check:ticket-deps`.

Archive status: archived by post-ticket review on 2026-05-17; series continuation is `$implement-ticket tickets/179ACTSELPRE-009.md`.
