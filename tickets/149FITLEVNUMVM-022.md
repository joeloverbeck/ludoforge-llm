# 149FITLEVNUMVM-022: Phase 4B final reprofile gate

**Status**: BLOCKED by red Phase 5/WASM successor gate — successor owner `tickets/150FITLWASM-033.md`
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Maybe — perf gate test/report helper only if the current harness cannot assert the owned metric
**Deps**: `archive/tickets/149FITLEVNUMVM-019.md`, `archive/tickets/149FITLEVNUMVM-020.md`, `archive/tickets/149FITLEVNUMVM-021.md`, `archive/tickets/150FITLWASM-013.md`, `archive/tickets/150FITLWASM-014.md`, `archive/tickets/150FITLWASM-010.md`, `tickets/150FITLWASM-033.md`

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

User decision on 2026-05-02: proceed with Option 2. Phase 4B remains blocked at the original budget, ticket 016 remains blocked, and the successor owner is `specs/150-fitl-policy-vm-wasm-port.md`. Starter ticket `archive/tickets/150FITLWASM-001.md` landed the Phase 5 skeleton; post-review created successor ticket `archive/tickets/150FITLWASM-002.md` for WASM policy-bytecode execution parity. Post-review of `150FITLWASM-002` created successor ticket `archive/tickets/150FITLWASM-003.md` for the encoded-state/action batch bridge. Ticket `150FITLWASM-003` delivered the supported batch ABI and created successor ticket `archive/tickets/150FITLWASM-004.md` for candidate-dependent batch scoring integration. Ticket `150FITLWASM-004` delivered supported scalar candidate score rows, ticket `150FITLWASM-005` delivered non-preview score-row handoff, ticket `150FITLWASM-006` delivered preview-backed score-row parity and recorded a red `6539.22 ms` same-seam preflight, ticket `150FITLWASM-007` delivered active production WASM score-row routing and recorded a red `7131.37 ms` same-seam gate with `wasmScoreRowRouteCount=65`, ticket `150FITLWASM-008` delivered score-row setup caching and recorded a red `6593.68 ms` same-seam gate with `wasmScoreRowRouteCount=65`, `wasmScoreRowUnsupportedCount=0`, and `wasmScoreRowBytecodeCompileCount=42`, ticket `150FITLWASM-009` delivered preview-state/surface row materialization and recorded a red `6632.26 ms` same-seam gate with `wasmPreviewCandidateFeatureRowRouteCount=77`, and successor ticket `archive/tickets/150FITLWASM-010.md` was created for preview-drive application/runtime handoff and perf gate closure. Reassessment of `150FITLWASM-010` on 2026-05-03 split out `archive/tickets/150FITLWASM-013.md` for the encoded preview-state slot substrate; later Foundation-aligned reassessment split `archive/tickets/150FITLWASM-014.md` for the generic production preview-drive substrate. Ticket `150FITLWASM-014` implemented that prerequisite, ticket `150FITLWASM-010` completed production routing and fail-closed-clean route activation but left the gate red at `4124.29 ms`, ticket `150FITLWASM-015` landed route-local literal cleanup but left the gate red at `3958.91 ms`, ticket `150FITLWASM-016` landed a generic hash-cache slice but left the gate red at `4018.94 ms`, ticket `150FITLWASM-017` landed active-route query-materialization runtime reuse but left the gate red at `2898.06 ms`, ticket `150FITLWASM-018` landed active-route token-index/digest cleanup but left the gate red at `2761.91 ms`, and ticket `150FITLWASM-019` landed exact shared FNV hashing but left the gate red at `2460.65 ms`; archived ticket `150FITLWASM-020` later landed residual active-route query/eval/encoding work and handed the successor to `archive/tickets/150FITLWASM-021.md`, which then landed a setup-hash root-counter reduction and handed the active successor to `archive/tickets/150FITLWASM-022.md`; ticket `150FITLWASM-022` landed bounded dynamic Zobrist feature-key memoization and handed the successor to `archive/tickets/150FITLWASM-023.md`; ticket `150FITLWASM-023` landed apply-move token-placement hash deferral and handed the current active successor to `archive/tickets/150FITLWASM-024.md`.

2026-05-04 successor update: ticket `150FITLWASM-020` landed generic
token-placement hash elision plus WeakMap-scoped encoded bytecode input caching,
kept active-route unsupported counters at zero in diagnostic probes, and left
the same-seam gate red around `2.5 s` versus `<=250 ms`. The current active
successor owner moved to `archive/tickets/150FITLWASM-021.md` for deeper
active-route query/apply/hash residual closure. Ticket `150FITLWASM-021`
landed a setup-hash root-counter reduction but left the same-seam gate red
around `2.5 s`, moving the successor to `archive/tickets/150FITLWASM-022.md`.

2026-05-04 successor update: ticket `150FITLWASM-022` landed bounded dynamic
Zobrist feature-key memoization and kept the active route clean, but the
same-seam gate remained red at per-card `elapsedMs=2539.8` versus `<=250`.
The active successor owner moved to `archive/tickets/150FITLWASM-023.md` for residual
query/eval/reference-resolution and token-placement hash closure.

2026-05-04 successor update: ticket `150FITLWASM-023` landed apply-move
token-placement hash deferral and kept the active route clean, but the
same-seam gate remained red at per-card `elapsedMs=2557.17` versus `<=250`.
The current active successor owner moved to `archive/tickets/150FITLWASM-024.md` for
initial full-hash, query/eval/reference-resolution, encoding, and token-index
residual closure.

2026-05-04 successor update: ticket `150FITLWASM-024` landed initial full-hash
runtime-table cache reuse and kept the active route clean, but the same-seam
gate remained red at per-card `elapsedMs=2467.29` versus `<=250`. The current
active successor owner moved to `archive/tickets/150FITLWASM-025.md` for query/eval,
initial-hash, encoding, and token-index residual closure.

2026-05-04 successor update: ticket `150FITLWASM-025` landed generic FNV
prefix-state reuse for Zobrist feature keys and decision-stack digest salts and
kept the active route clean, but the same-seam gate remained red at per-card
`elapsedMs=2375.99` versus `<=250`. The current active successor owner moved
to `archive/tickets/150FITLWASM-026.md` for residual query/eval, encoding, token-index,
spatial-filter, and remaining-hash closure.

2026-05-04 successor update: ticket `150FITLWASM-026` landed a run-local
pending-request fingerprint cache in generic decision-sequence analysis and
kept the active route clean, but the same-seam gate remained red at per-card
`elapsedMs=2408.84` versus `<=250`. The current active successor owner moved
to `archive/tickets/150FITLWASM-027.md` for residual stable-fingerprint,
query/eval/reference-resolution, spatial-filter, encoding, token-index, and
remaining-hash closure.

2026-05-04 successor update: ticket `150FITLWASM-027` landed a generic
namespace-prefix stable-fingerprint hasher for decision-sequence pending
requests and kept the active route clean, but the same-seam gate remained red
at per-card `elapsedMs=2477.81` versus `<=250`. The successor owner moved to
`archive/tickets/150FITLWASM-028.md` for query/eval/reference-resolution,
spatial-filter, encoding, token-index, decision-stack digest, and remaining-hash
closure.

2026-05-04 successor update: ticket `150FITLWASM-028` landed generic
query/spatial allocation reductions and cached WASM layout encoding, kept the
active route clean, and reduced the same-seam gate from the prior `~2.5 s`
range into the low `~2.1 s` range while it remained red versus `<=250`. The
post-review correction kept `150FITLWASM-029` active for remaining
allocation, encoding, query/eval, token-index, decision-stack digest, and
hash/canonicalization closure because the reviewer note requires continuing
same-ticket residual reduction before a successor handoff.

2026-05-04 successor update: ticket `150FITLWASM-029` continued after
post-review, landed static binding-name shortcuts, token-index scan allocation
reduction, and a versioned per-context `resolveRef` cache, kept the active
route clean, produced a diagnostic per-card `elapsedMs=1891.88`, and left the
decisive final same-seam gate red at per-card `elapsedMs=2046.48` versus
`<=250`. Ticket `150FITLWASM-030` landed connected-zone queue allocation and
boolean connected-condition traversal reductions, kept the active route clean,
and left the decisive final same-seam gate red at per-card `elapsedMs=1910.21`
versus `<=250`. The active successor owner moved to
`archive/tickets/150FITLWASM-031.md` for remaining reference/eval, token-index,
hash/canonicalization, and allocation/GC residual closure. Ticket
`150FITLWASM-031` landed generic microturn continuation-binding allocation
cleanup, a `tokenZones` allocation cleanup, and a compiled `zoneVar`
dynamic-selector parity fix while leaving the confirmed final gate red at
per-card `elapsedMs=1773.64`. Ticket `150FITLWASM-032` landed the larger
post-031 residual slice and left the final gate red at per-card
`elapsedMs=1561.81`. The active successor owner moved to
`tickets/150FITLWASM-033.md` for post-count hash/canonicalization, token-index,
WASM input, token-filter/count-loop, and allocation/GC residual closure.
