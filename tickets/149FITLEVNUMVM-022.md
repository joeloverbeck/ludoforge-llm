# 149FITLEVNUMVM-022: Phase 4B final reprofile gate

**Status**: BLOCKED by red Phase 4B final gate — successor owner `tickets/150FITLWASM-008.md`
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Maybe — perf gate test/report helper only if the current harness cannot assert the owned metric
**Deps**: `archive/tickets/149FITLEVNUMVM-019.md`, `archive/tickets/149FITLEVNUMVM-020.md`, `archive/tickets/149FITLEVNUMVM-021.md`, `tickets/150FITLWASM-008.md`

## Problem

Tickets 019-021 split the remaining non-policy-VM preview-drive runtime closure into its proven hot buckets:

- kernel expression/query interpretation;
- preview state and token-index lifetime;
- preview hashing and verification strategy.

This ticket owns the final measured decision: whether those Phase 4B changes make the original Phase 4 `<=250 ms` one-card gate truthful and therefore unblock ticket 016 for the F14 default-flip/deletion cut.

## What to Change

1. Verify tickets 019-021 are complete or explicitly classified as no longer active owners.
2. Run the same-seam one-card profile with default `verifyIncrementalHash=true`:

```bash
timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final
```

3. Create or update `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` only when the measured gate is green and the test can truthfully assert `<=250 ms`.
4. Record exact elapsed values, per-card row values, profile buckets, and pass/fail verdict in this ticket's Outcome.
5. If the gate is green, mark ticket 016 unblocked.
6. If the gate remains red, do not weaken the target. Use 1-3-1 to choose among more Phase 4B work, a Phase 5/WASM spec, or a user-approved target reset.

## Files to Touch

- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` if and only if the gate is green enough to assert truthfully
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if the harness cannot expose the required metric
- `tickets/149FITLEVNUMVM-022.md`
- `tickets/149FITLEVNUMVM-016.md` if unblocking status is recorded

## Out of Scope

- Implementing the hot-path fixes from tickets 019-021.
- Default-flipping the policy VM or deleting closure-tree code; ticket 016 owns that.
- Remaining CI restoration; ticket 003 owns that after ticket 016 closes.
- Weakening the `<=250 ms` Phase 4 budget.

## Acceptance Criteria

1. Same-seam profile records `<=250 ms` under all 4 baseline profiles with `verifyIncrementalHash=true`, or records the exact red result and stops for a new decision.
2. If green, `fitl-per-card-cost.perf.test.ts` asserts the truthful `<=250 ms` budget.
3. If green, ticket 016 is updated as unblocked for default flip + closure-tree deletion.
4. If red, ticket 016 remains blocked and no F14 deletion occurs.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final`.
3. If the perf gate test is added or updated: `pnpm -F @ludoforge/engine test:perf`.

## Outcome

2026-05-02 final Phase 4B same-seam profile was run against fresh built engine output:

- `pnpm -F @ludoforge/engine build` — PASS.
- Command substitution: the ticket command was run with `LUDOFORGE_POLICY_VM=on` because ticket 016 and the archived Phase 4B prerequisites define this as the VM-on Phase 4 gate:
  `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final`.
- Verdict: RED for the Phase 4 `<=250 ms` gate.
- Overall elapsed: `6702.87 ms`.
- Per-card row: `turnCount=0`, `elapsedMs=6702.65`, `decisions=159`, `msPerDecision=42.155`, `closeReason=turnCountAdvanced`.
- Profile buckets:
  - `simAgentChooseMove`: `count=159`, `totalMs=3984.24`.
  - `agent:evaluatePolicyExpression`: `count=159`, `totalMs=3981.83`.
  - `simApplyMove`: `count=159`, `totalMs=854.17`.
  - `simTerminalResult`: `count=160`, `totalMs=4.77`.
  - `simLegalMoves`: `count=160`, `totalMs=1.04`.
  - `lifecycle:dispatchTriggers`: `count=2`, `totalMs=0.3`.
  - `simComputeDeltas`: `count=159`, `totalMs=0.09`.
  - `lifecycle:resolveEffects`: `count=2`, `totalMs=0.04`.
- Token/index counters: `tokenStateIndexBuildCount=2377`, `draftTokenStateIndexDeltaCount=198`, `draftTokenStateIndexAttachCount=834`, `draftTokenStateIndexSnapshotCount=315`, `draftTokenStateIndexCowCopyCount=120`.
- Drive exits: `driveExitTotal=211`; depth caps remained for `us-baseline` (`1`) and `vc-baseline` (`1`).

No perf gate test was added because the measured result cannot truthfully assert `<=250 ms`. Ticket 016 remains blocked, and no F14 default flip or closure-tree deletion is authorized by this result.

Required 1-3-1 decision point:

- Problem: Phase 4B prerequisites are complete, but the final VM-on same-seam gate is still red at `6702.65 ms` per card versus the `<=250 ms` target.
- Option 1: keep the `<=250 ms` target and create/execute another Phase 4B profiling/optimization slice focused on the remaining `agent:evaluatePolicyExpression` and preview-apply buckets.
- Option 2: stop Phase 4B as failed and promote a Phase 5/WASM spec as the next architectural owner for the original budget.
- Option 3: request a user-approved target reset, record the acceptance exception explicitly, and then decide whether ticket 016 may proceed under the revised budget.
- Recommendation: Option 2. The final Phase 4B profile is still about `26.8x` over budget after tickets 019-021, so more TypeScript-local tuning is unlikely to close the gap cleanly.

User decision on 2026-05-02: proceed with Option 2. Phase 4B remains blocked at the original budget, ticket 016 remains blocked, and the successor owner is `specs/150-fitl-policy-vm-wasm-port.md`. Starter ticket `archive/tickets/150FITLWASM-001.md` landed the Phase 5 skeleton; post-review created successor ticket `archive/tickets/150FITLWASM-002.md` for WASM policy-bytecode execution parity. Post-review of `150FITLWASM-002` created successor ticket `archive/tickets/150FITLWASM-003.md` for the encoded-state/action batch bridge. Ticket `150FITLWASM-003` delivered the supported batch ABI and created successor ticket `archive/tickets/150FITLWASM-004.md` for candidate-dependent batch scoring integration. Ticket `150FITLWASM-004` delivered supported scalar candidate score rows, ticket `150FITLWASM-005` delivered non-preview score-row handoff, ticket `150FITLWASM-006` delivered preview-backed score-row parity and recorded a red `6539.22 ms` same-seam preflight, ticket `150FITLWASM-007` delivered active production WASM score-row routing and recorded a red `7131.37 ms` same-seam gate with `wasmScoreRowRouteCount=65`, and active successor ticket `tickets/150FITLWASM-008.md` owns production preview row materialization and perf gate closure.
