# 63AGEEVOOBS-004: Per-decision margin trajectory in VC tournament runner

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — campaign-only
**Deps**: `archive/tickets/63AGEEVOOBS-003.md`

## Problem

The VC agent evolution harness lacks the same margin trajectory observability as the ARVN runner. Both FITL tournament runners need parity so the evolution loop can diagnose margin-impacting decisions regardless of which faction is being evolved.

## Assumption Reassessment (2026-04-11)

1. `campaigns/fitl-vc-agent-evolution/run-tournament.mjs` exists (364 lines) — confirmed.
2. The VC runner is structurally identical to the ARVN runner — confirmed.
3. VC agent profile also defines `selfMargin` — false in the live codebase. The current FITL binding still maps `vc` to `vc-baseline`, and the emitted VC `agentDecision` payload does not include `stateFeatures.selfMargin`, so margin fields remain `null` under the runner-only scope chosen for this ticket.

## Architecture Check

1. Same margin trajectory logic as 003 — lives in campaign-specific runner, not engine.
2. Port of identical logic — no new design decisions.
3. No backwards-compatibility shims.

## What to Change

### 1. Port selfMargin extraction

Copy the selfMargin extraction logic from the ARVN runner (added in 63AGEEVOOBS-003) to the VC runner's seed loop.

### 2. Port marginAfter/marginDelta computation

Apply the same margin computation logic from 003: `marginAfter` from the next evolved-seat decision, `marginDelta` as the difference, and last move uses `evolvedMargin` when the upstream decision payload includes `selfMargin`. Otherwise preserve `null` rather than inventing values.

### 3. Port margin fields to per-seed trace evolvedMoves

Enrich each evolved move in the VC runner's `traceSummary.evolvedMoves` with `marginBefore`, `marginAfter`, `marginDelta`, matching the ARVN runner's field shape exactly. Under the current VC baseline binding, those fields are expected to serialize as `null`.

## Files to Touch

- `campaigns/fitl-vc-agent-evolution/run-tournament.mjs` (modify)

## Out of Scope

- ARVN tournament runner (already done in 63AGEEVOOBS-003)
- Decision-type breakdown (separate tickets 63AGEEVOOBS-001/002)
- Refactoring shared code between ARVN and VC runners

## Acceptance Criteria

### Tests That Must Pass

1. Run VC tournament with `--seeds 3 --trace-all false --trace-seed 1000`: `last-trace.json` includes `marginBefore`, `marginAfter`, `marginDelta` for each evolved move.
2. `marginDelta` equals `marginAfter - marginBefore` for every non-null move.
3. Under the current `vc-baseline` binding, the VC runner preserves `null` margin fields when `agentDecision.stateFeatures.selfMargin` is absent; it does not synthesize per-decision margins from other data.
4. Existing suite: `pnpm turbo build && pnpm turbo test`

### Invariants

1. Engine code is not modified.
2. VC runner trace shape matches ARVN runner trace shape for margin fields, even when the current VC profile leaves those values `null`.

## Test Plan

### New/Modified Tests

1. Manual verification: run VC tournament with `--seeds 3 --trace-all false --trace-seed 1000`, inspect `last-trace.json` for margin fields and confirm the current VC baseline emits `null` values.

### Commands

1. `node campaigns/fitl-vc-agent-evolution/run-tournament.mjs --seeds 3 --trace-all false --trace-seed 1000 && node -e "const t=JSON.parse(require('fs').readFileSync('campaigns/fitl-vc-agent-evolution/last-trace.json','utf8'));console.log(JSON.stringify({sample:t.evolvedMoves.slice(0,3).map(({marginBefore,marginAfter,marginDelta})=>({marginBefore,marginAfter,marginDelta})),deltasOk:t.evolvedMoves.every((m)=>m.marginBefore==null||m.marginAfter==null||m.marginDelta===m.marginAfter-m.marginBefore),lastMoveAfter:t.evolvedMoves.at(-1)?.marginAfter??null,vcMargin:t.vcMargin},null,2))"`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

Completed: 2026-04-11

Completed the runner-only VC parity port in `campaigns/fitl-vc-agent-evolution/run-tournament.mjs`. Saved evolved moves now include `marginBefore`, `marginAfter`, and `marginDelta` fields with the same JSON shape as the ARVN runner.

Implementation also verified that the current FITL binding still maps `vc` to `vc-baseline`, so VC `agentDecision` payloads do not include `stateFeatures.selfMargin`. Because this ticket intentionally stayed campaign-only and did not modify the VC agent profile, the new margin fields remain `null` in live VC traces. That limitation is now part of the ticket contract instead of being silently ignored.

Schema/artifact audit: no engine, schema, or generated artifact files changed.

## Verification Run

- `node --check campaigns/fitl-vc-agent-evolution/run-tournament.mjs`
- `pnpm -F @ludoforge/engine build`
- `node campaigns/fitl-vc-agent-evolution/run-tournament.mjs --seeds 3 --trace-all false --trace-seed 1000`
- `node -e "const fs=require('fs'); const trace=JSON.parse(fs.readFileSync('campaigns/fitl-vc-agent-evolution/last-trace.json','utf8')); const deltasOk=trace.evolvedMoves.every((m)=>m.marginBefore==null||m.marginAfter==null||m.marginDelta===m.marginAfter-m.marginBefore); const last=trace.evolvedMoves.at(-1) ?? null; console.log(JSON.stringify({seed:trace.seed, evolvedMoveCount:trace.evolvedMoveCount, sample:trace.evolvedMoves.slice(0,3).map(({marginBefore,marginAfter,marginDelta})=>({marginBefore,marginAfter,marginDelta})), deltasOk, lastMoveAfter:last?.marginAfter ?? null, vcMargin:trace.vcMargin}, null, 2));"`
- `pnpm turbo build`
- `pnpm turbo test`
